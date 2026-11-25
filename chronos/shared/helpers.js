// helpers para escribir preguntas de forma compacta (se barajan al mostrarlas)
//  Q = alternativas (la 1ª es la correcta)   U = ordenar letras   F = sopa de letras (palabra ≤ 9 letras)
//  W = respuesta escrita (la corrige Gemini; kw = grupos de palabras clave de respaldo sin conexión)
const Q = (z, ic, n, tema, q, right, wrong, e) => ({ t: 'q', z, ic, n, tema, q, o: [right, ...wrong], a: 0, e });
const U = (z, ic, n, tema, p, w) => ({ t: 'u', z, ic, n, tema, p, w });
const F = (z, ic, n, tema, p, w) => ({ t: 'f', z, ic, n, tema, p, w });
const W = (z, ic, n, tema, q, ref, kw) => ({ t: 'w', z, ic, n, tema, q, ref, kw });
