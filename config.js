// Configuracion publica del cliente.
//
// Esta key viaja al navegador de cada visitante dentro de este archivo, asi que
// NO es secreta y nunca lo fue. Lo que la protege es la restriccion por HTTP
// referrer configurada en Google Cloud Console:
//   https://turismoruraljujuy.com.ar/*
//   https://www.turismoruraljujuy.com.ar/*
// Esa restriccion no se toca. Es lo unico que impide que otro sitio la use.
//
// Verificado: Google rechaza las keys con restriccion de referrer en las APIs
// REST (Geocoding, Directions, Places server-side), incluso falsificando el
// header. Solo funciona cargando Maps JavaScript desde los dominios de arriba.
//
// NO agregar secretos reales aca. Un secreto real va como secret del worker
// de Cloudflare, nunca en un archivo servido al navegador.

window.MAPS_API_KEY = 'AIzaSyBLFU4Be6M4xEkzSNuCvoL8BIbqvYa9WqY';