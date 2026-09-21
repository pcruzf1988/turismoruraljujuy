/**
 * Ayni — asistente virtual de Turismo Rural Jujuy
 * Cloudflare Worker: proxy hacia la Messages API de Anthropic.
 *
 * La API key vive como secret del worker (env.ANTHROPIC_API_KEY)
 * y nunca llega al navegador.
 */

const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ2yQd6691oT5gGiVAH3mV0ItZZzhpIWCt7CXKbX6UqSpJy76teHK-o6hKeIYeu1p-I1NhFjNxvP0E/pub?gid=0&single=true&output=csv";

const MODELO = 'claude-haiku-4-5-20251001';

// Una consulta amplia puede tener diez o mas emprendimientos que califican
// (cabalgatas da 10 sobre 75). Con 1024 la lista se cortaba a la mitad.
// Es un techo, no un objetivo: las respuestas cortas siguen costando poco.
const MAX_TOKENS = 2048;

// Cachear el CSV en el borde alinea el prefijo del prompt durante 5 minutos,
// que es exactamente la ventana del prompt caching de Anthropic.
const CSV_CACHE_TTL = 300;

// Límites de entrada: el cliente no es confiable.
const MAX_MENSAJES = 20;
const MAX_CHARS_POR_MENSAJE = 2000;

const ORIGENES_PERMITIDOS = new Set([
  'https://turismoruraljujuy.com.ar',
  'https://www.turismoruraljujuy.com.ar',
]);

const AYNI_SYSTEM_PROMPT = `Tu nombre es Ayni. Sos una asistente virtual cálida y cercana de la plataforma de turismo rural e indígena de Jujuy, Argentina. Tu nombre viene del concepto quechua de reciprocidad y complementariedad: dar y recibir en equilibrio.

Tu misión es ayudar a viajeros y turistas a descubrir los emprendimientos de las comunidades indígenas de la Puna, la Quebrada de Humahuaca y las Yungas jujeñas.

CÓMO DEBÉS COMPORTARTE:
- Hablás en español, con calidez, cercanía y respeto profundo por las comunidades y sus culturas.
- Usás un tono que invita a descubrir Jujuy, sin exagerar ni ser artificial.
- Sos breve en CUÁNTO decís de cada emprendimiento, nunca en CUÁNTOS mencionás. Si diez cumplen con lo que te piden, van los diez. Dejar uno afuera es quitarle una oportunidad de trabajo a esa familia.
- Cuando son varios, usá una línea por emprendimiento (nombre, comunidad y qué ofrece) y cerrá ofreciendo ampliar sobre el que le interese. Una lista de diez líneas es corta; diez párrafos no.
- Si ya hiciste preguntas para afinar la búsqueda, igual mostrá todo lo que entra en el filtro final. Afinar sirve para ordenar por relevancia, no para recortar la lista.

CÓMO BUSCAR POR ACTIVIDAD:

Cada ficha trae dos campos distintos y no significan lo mismo:

- "Rubro" es la categoría principal, UNA sola. Dice a qué se dedica el emprendimiento, no todo lo que ofrece.
- "Actividades" es la lista completa de lo que ofrece, ya extraída de su descripción. Etiquetas posibles: cabalgatas, trekking, gastronomia, artesanias, alojamiento, agro, bicicleta, avistaje, talleres.

Cuando te pregunten por una actividad, filtrá SIEMPRE por el campo "Actividades", nunca por "Rubro". Un emprendimiento con Rubro "Alojamiento" y Actividades "alojamiento, cabalgatas" ofrece cabalgatas y tiene que aparecer cuando alguien las busque.

Si al terminar una búsqueda todos tus resultados comparten el mismo Rubro, filtraste por el campo equivocado: rehacé la búsqueda mirando "Actividades".

Si una ficha dice "sin clasificar", significa que no se le detectaron etiquetas. Revisá su descripción a mano antes de descartarla.

ANTES DE ENVIAR LA RESPUESTA, verificá: contá cuántas fichas tienen la etiqueta que te pidieron y asegurate de haberlas listado TODAS. Si contaste ocho y escribiste seis, faltan dos: volvé y agregalas. Este control no se saltea, ni siquiera cuando la lista te parece larga.
- Cuando alguien pregunta por emprendimientos, los describís con entusiasmo genuino y ofrecés sus datos de contacto, aclarando que sean pacientes ya que en muchas comunidades no hay señal y a veces la respuesta puede demorar.
- Si alguien tiene dudas sobre qué región o tipo de experiencia elegir, hacés preguntas amables para entender sus intereses y recomendás lo más adecuado.
- Nunca inventás información. Si algo no está en los datos, lo decís con honestidad: "Lamentablemente, no tengo ese dato, te recomiendo contactar directamente al emprendimiento o al siguiente número de whatsapp +5492281655190" o "Esa información no la manejo aún".
- No hablás de temas ajenos al turismo en Jujuy y los emprendimientos de la plataforma. Si te preguntan otra cosa, redirigís amablemente.
- Podés usar algún emoji ocasionalmente para dar calidez, pero sin abusar.
- Si te contactan desde agencias de viajes o alguien que te ofrece algo le decís "Lo siento, soy un asistente virtual y no puedo procesar ese pedido. Te recomiendo contactarte directamente con los emprendedores o envíes mensaje al siguiente número de whatsapp https://wa.me/5492281655190"
- Cuando des un número de WhatsApp, SIEMPRE formatealo como link así: [5492281655190](https://wa.me/5492281655190) — usando el número como texto visible y la URL como destino. Nunca escribas el número solo ni la URL cruda.

LO QUE PODÉS RESPONDER:
- Información de cada emprendimiento: nombre, descripción, servicios, región, comunidad, categoría.
- Datos de contacto: WhatsApp, Instagram, Facebook, email.
- Recomendaciones según intereses del viajero (naturaleza, cultura, gastronomía, artesanías, aventura, etc.).
- Diferencias entre regiones (Puna, Quebrada, Yungas) para orientar la elección.
- Qué tipo de experiencias ofrece cada emprendimiento.

LO QUE NO RESPONDÉS:
- Precios (no están en los datos, derivás al contacto directo).
- Disponibilidad o reservas (ídem).
- Temas que no tengan relación con la plataforma o el turismo en Jujuy.

Los datos actualizados de los emprendimientos te los paso a continuación en formato CSV. Usá esa información como tu fuente de verdad.`;

/**
 * Parser CSV según RFC 4180.
 *
 * El parser anterior hacía split('\n'), y como las descripciones del Sheet
 * contienen saltos de línea dentro de comillas, partía cada emprendimiento
 * en varias filas falsas: 780 registros en lugar de 75.
 */
function parseCSV(texto) {
  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];

    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"'; // comilla escapada ("")
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        campo += c; // incluye saltos de línea internos
      }
      continue;
    }

    if (c === '"') entreComillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }

  if (campo !== '' || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }

  if (filas.length === 0) return [];

  const headers = filas[0].map(h => h.trim());

  return filas
    .slice(1)
    .filter(f => f.some(v => v.trim() !== ''))
    .map(f => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (f[i] || '').trim(); });
      return obj;
    })
    .filter(e => (e.Emprendimiento || '').trim() !== '');
}

/**
 * El campo "Rubro" del Sheet guarda una sola categoria principal, asi que un
 * alojamiento que ademas ofrece cabalgatas queda etiquetado solo como
 * "Alojamiento". Pedirle al modelo que rastree eso leyendo las 75 descripciones
 * no funciono: encontraba los 6 del rubro obvio y se perdia los 2 restantes.
 *
 * Asi que la deteccion se hace aca, de forma deterministica, y el modelo recibe
 * el dato ya resuelto como un campo mas.
 *
 * Los patrones corren sobre texto normalizado (sin acentos, minusculas) y usan
 * \b para no matchear dentro de otra palabra: sin eso, "formulas" matcheaba
 * "mula" y "mula mula" (una hierba aromatica) entraba como cabalgata.
 */
function normalizar(t) {
  return (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const ACTIVIDADES = [
  ['cabalgatas',   /\b(cabalgat\w*|caballos?|jinetes?|arreos?\s+de\s+animales)\b/],
  ['trekking',     /\b(trekking|caminatas?|senderismo|senderos?|ascensos?|excursion\w*)\b/],
  ['gastronomia',  /\b(gastronom\w*|almuerzos?|cenas?|degustacion\w*|comidas?\s+(?:tipicas|regionales|caseras)|cocina\s+\w+)\b/],
  ['artesanias',   /\b(artesan\w*|telar\w*|tejidos?|ceramica|alfarer\w*|hilado\w*)\b/],
  ['alojamiento',  /\b(alojamiento|hospedaje|cabanas?|camping|pernocte|habitaciones?)\b/],
  ['agro',         /\b(siembra|cosecha|huerta|granja|apicultura|ordene|chacra)\b/],
  ['bicicleta',    /\b(bicicletas?|bici|ciclismo|mountain\s*bike)\b/],
  ['avistaje',     /\b(avistaje|avistamiento|observacion\s+de\s+aves)\b/],
  ['talleres',     /\b(talleres?\s+de|aprender\w*\s+a)\b/],
];

function detectarActividades(e) {
  const texto = normalizar([
    e['Rubro'],
    e['Descripción'],
    e['Info / Atención / Condiciones de reserva'],
  ].join(' \n '));
  return ACTIVIDADES.filter(([, re]) => re.test(texto)).map(([nombre]) => nombre);
}

function formatDataForAyni(emprendimientos) {
  return emprendimientos.map(e => {
    const telefono  = e['Teléfono( sin guiones ni espacios: 5493884123456)'] || '';
    const instagram = e['Instagram (solo el usuario, sin @)'] || '';
    const facebook  = e['Facebook (solo el nombre de usuario)'] || '';
    const email     = e['Correo electrónico'] || '';
    const comunidad = e['Comunidad / Pueblo'] || '';
    const ubicacion = e['Ubicación (formato: -23.5772, -65.3969 latitud,longitud)'] || '';

    const contacto = [];
    if (telefono)  contacto.push(`WhatsApp: https://wa.me/${telefono}`);
    if (instagram) contacto.push(`Instagram: @${instagram}`);
    if (facebook)  contacto.push(`Facebook: ${facebook}`);
    if (email)     contacto.push(`Email: ${email}`);

    const actividades = detectarActividades(e);

    return `---
EMPRENDIMIENTO: ${e.Emprendimiento || ''}
Región: ${e.Región || ''}
Rubro: ${e.Rubro || ''}
Actividades: ${actividades.join(', ') || 'sin clasificar'}
Comunidad: ${comunidad}
Descripción: ${e.Descripción || ''}
Info adicional: ${e['Info / Atención / Condiciones de reserva'] || ''}
Ubicación: ${ubicacion}
Contacto: ${contacto.join(' | ') || 'No disponible'}`;
  }).join('\n');
}

function headersCORS(origen) {
  return {
    'Access-Control-Allow-Origin': ORIGENES_PERMITIDOS.has(origen) ? origen : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const MENSAJE_LIMITE = 'Estoy recibiendo muchas consultas en este momento. Esperá unos segundos y volvé a escribirme 🙏';

/**
 * Rate limiting con los bindings declarados en wrangler.toml.
 *
 * Dos límites en paralelo:
 *   - por IP    -> frena a un atacante puntual
 *   - global    -> techo del endpoint, acota un ataque distribuido
 *
 * Es permisivo por diseño: Cloudflare cachea los contadores por máquina y los
 * sincroniza en background, así que no cuenta con precisión de reloj. Medido en
 * producción: con 200 requests concurrentes rechazó 60. Sirve como válvula
 * contra abuso, no como sistema contable. El tope de gasto del workspace de
 * Anthropic sigue siendo la garantía dura.
 *
 * Si los bindings no están (deploy sin wrangler.toml), no se cae: avisa por log
 * y deja pasar. Un worker caído es peor que un worker sin límite.
 */
async function superaLimite(request, env) {
  if (!env.AYNI_LIMIT_IP || !env.AYNI_LIMIT_GLOBAL) {
    console.warn('Bindings de rate limit ausentes: el endpoint está sin límite.');
    return false;
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'sin-ip';

  const [porIP, global] = await Promise.all([
    env.AYNI_LIMIT_IP.limit({ key: ip }),
    env.AYNI_LIMIT_GLOBAL.limit({ key: 'global' }),
  ]);

  if (!porIP.success || !global.success) {
    console.warn(`Rate limit alcanzado: ip=${ip} por_ip=${porIP.success} global=${global.success}`);
    return true;
  }

  return false;
}

/**
 * Normaliza el historial que manda el cliente.
 * Devuelve { messages } o { error } si la entrada no sirve.
 */
function validarMensajes(entrada) {
  if (!Array.isArray(entrada) || entrada.length === 0) {
    return { error: 'El campo "messages" debe ser un array no vacío.' };
  }

  const recortado = entrada.slice(-MAX_MENSAJES);
  const limpios = [];

  for (const m of recortado) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) {
      return { error: 'Cada mensaje necesita un "role" válido (user o assistant).' };
    }
    if (typeof m.content !== 'string' || m.content.trim() === '') {
      return { error: 'Cada mensaje necesita un "content" de texto.' };
    }
    limpios.push({
      role: m.role,
      content: m.content.slice(0, MAX_CHARS_POR_MENSAJE),
    });
  }

  if (limpios[0].role !== 'user') {
    return { error: 'La conversación tiene que empezar con un mensaje del usuario.' };
  }

  return { messages: limpios };
}

export default {
  async fetch(request, env) {
    const origen = request.headers.get('Origin') || '';
    const cors = headersCORS(origen);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Método no permitido.' }, 405, cors);
    }

    // Rate limiting antes de gastar plata: se descarta la request sin llegar
    // a leer el Sheet ni llamar a Anthropic.
    const limitado = await superaLimite(request, env);
    if (limitado) {
      return json({ error: MENSAJE_LIMITE }, 429, { ...cors, 'Retry-After': '60' });
    }

    let cuerpo;
    try {
      cuerpo = await request.json();
    } catch {
      return json({ error: 'El cuerpo del request no es JSON válido.' }, 400, cors);
    }

    const validacion = validarMensajes(cuerpo?.messages);
    if (validacion.error) {
      return json({ error: validacion.error }, 400, cors);
    }

    try {
      // 1. Datos del Sheet, cacheados en el borde para estabilizar el prefijo del prompt.
      const sheetResponse = await fetch(SHEET_CSV_URL, {
        cf: { cacheTtl: CSV_CACHE_TTL, cacheEverything: true },
      });

      if (!sheetResponse.ok) {
        console.error('Sheet no disponible:', sheetResponse.status);
        return json({ error: 'No pude leer los datos de los emprendimientos.' }, 503, cors);
      }

      const emprendimientos = parseCSV(await sheetResponse.text());

      if (emprendimientos.length === 0) {
        console.error('El CSV se leyó pero no produjo emprendimientos.');
        return json({ error: 'No pude leer los datos de los emprendimientos.' }, 503, cors);
      }

      const datosFormateados = formatDataForAyni(emprendimientos);

      // 2. Messages API. El system va como bloque cacheado: es el 99% de los
      //    tokens de entrada y sólo cambia cuando se edita el Sheet.
      //    Las lecturas de caché cuestan 0,1x del precio base.
      const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODELO,
          max_tokens: MAX_TOKENS,
          system: [
            {
              type: 'text',
              text: `${AYNI_SYSTEM_PROMPT}\n\nDATOS DE EMPRENDIMIENTOS:\n${datosFormateados}`,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: validacion.messages,
        }),
      });

      const data = await anthropicResponse.json();

      // 3. Un error de Anthropic es un error nuestro: no lo devolvemos con 200.
      if (!anthropicResponse.ok) {
        console.error(
          'Anthropic falló:',
          anthropicResponse.status,
          data?.error?.type,
          data?.error?.message,
        );
        return json({ error: 'El asistente no está disponible en este momento.' }, 502, cors);
      }

      // Observabilidad de costos: visible con `wrangler tail`.
      const u = data.usage || {};
      console.log(
        `emprendimientos=${emprendimientos.length}`,
        `input=${u.input_tokens}`,
        `cache_write=${u.cache_creation_input_tokens}`,
        `cache_read=${u.cache_read_input_tokens}`,
        `output=${u.output_tokens}`,
        // Si aparece "max_tokens", la respuesta se corto: hay que subir MAX_TOKENS.
        `stop=${data.stop_reason}`,
      );

      return json(data, 200, cors);

    } catch (error) {
      console.error('Error inesperado:', error);
      return json({ error: 'El asistente no está disponible en este momento.' }, 500, cors);
    }
  },
};
