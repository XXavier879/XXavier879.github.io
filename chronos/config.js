// ===== Configuración de la IA (Gemini, nivel gratuito) =====
// Pega tu API key en `key`. Se usa en el navegador (visible en el código fuente):
// usa una clave gratuita/desechable y restríngela por dominio en Google AI Studio.
// Si falla un modelo (cuota, nombre cambiado, sin internet) se prueba el siguiente;
// si fallan todos, la respuesta escrita se corrige por palabras clave.
window.GEMINI = {
  key: 'PEGA_AQUI_TU_API_KEY',
  models: ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-flash-lite-latest'],
  timeoutMs: 10000,   // por modelo
  totalMs: 24000,     // máximo total antes de usar el respaldo
};
