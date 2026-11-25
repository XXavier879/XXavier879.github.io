// Juego 1 — La Gran Guerra (Primera Guerra Mundial). 20 retos.
window.MAP = {
  title: 'Cronos I: La Gran Guerra', emoji: '💂', tag: 'Historia · 2° Medio · Primera Guerra Mundial',
  intro: 'Recorre Europa entre 1914 y 1919: de Sarajevo a las trincheras y a Versalles.',
  guideText: 'Frente Occidental (trincheras) al noroeste, Sarajevo al norte, el Frente Oriental nevado al noreste, Verdún al suroeste y Versalles al sureste.',
  size: [60, 42], start: [30, 33], seed: 1914, vidas: 5,
  guide: { n: 'Cronos', ic: '🧙', at: [31, 29] },
  zones: [
    { id: 'rio', name: 'Río del Tiempo', sub: '', r: [22, 0, 23, 41], g: 'water' },
    { id: 'plaza', name: 'Plaza Cronos', sub: 'Punto de partida', r: [26, 27, 35, 35], g: 'plaza' },
    { id: 'frente', name: 'Frente Occidental', sub: 'Francia · 1914', r: [0, 0, 21, 20], g: 'dirt', trees: [0.035, ['🌲']] },
    { id: 'sarajevo', name: 'Sarajevo', sub: 'Balcanes · 28 de junio de 1914', r: [24, 0, 42, 11], g: 'city' },
    { id: 'oriental', name: 'Frente Oriental', sub: 'Rusia · 1914–1917', r: [43, 0, 59, 20], g: 'snow', trees: [0.14, ['🌲']] },
    { id: 'verdun', name: 'Verdún', sub: 'Francia · 1916', r: [0, 21, 21, 41], g: 'dark', trees: [0.03, ['🌲']] },
    { id: 'versalles', name: 'Palacio de Versalles', sub: '1919 · La paz', r: [44, 21, 59, 41], g: 'plaza' },
    { id: 'valle', name: 'Valle de Cronos', sub: '', r: [0, 0, 59, 41], g: 'grass', trees: [0.15, ['🌳', '🌳', '🌲']] },
  ],
  trench: [1, 16, 17, 17],
  roads: [[30, 27, 30, 10], [36, 30, 46, 30], [46, 30, 46, 6], [46, 30, 46, 38], [26, 30, 8, 30], [8, 30, 8, 13], [8, 13, 30, 13]],
  bridges: [[22, 13, 23, 14], [22, 30, 23, 31]],
  buildings: [[3, 3, '🏚️'], [17, 5, '🏚️'], [5, 10, '🏚️'], [27, 3, '🏛️'], [38, 7, '🏠'], [47, 3, '⛪'], [54, 8, '🏚️'], [48, 24, '🏰'], [54, 31, '🏛️'], [49, 36, '🏰'], [4, 33, '🏚️'], [15, 36, '🏚️']],
  small: [[4, 24, '⛺'], [17, 24, '⛺'], [6, 30, '⛺'], [18, 38, '⛺'], [28, 29, '⛲', 62], [34, 29, '⛲', 62]],
  retos: [
    // — quiz (11) —
    Q('sarajevo', '🕵️', 'Periodista', 'Causas de la guerra', '¿Quién fue asesinado en Sarajevo el 28 de junio de 1914?', 'El archiduque Francisco Fernando, heredero del trono austrohúngaro', ['El káiser Guillermo II', 'El zar Nicolás II', 'El presidente francés Poincaré'], 'Este atentado fue el detonante de la guerra.'),
    Q('sarajevo', '🧑‍⚖️', 'Diplomático', 'Causas de la guerra', '¿Qué país declaró la guerra a Serbia en julio de 1914?', 'Austria-Hungría', ['Alemania', 'Rusia', 'Italia'], 'Austria-Hungría culpó a Serbia del atentado y le declaró la guerra el 28 de julio.'),
    Q('valle', '🎩', 'Embajador', 'Sistema de alianzas', '¿Qué países formaban la Triple Entente?', 'Francia, Reino Unido y Rusia', ['Alemania, Austria-Hungría e Italia', 'Francia, Italia y Japón', 'Rusia, Serbia y Turquía'], 'Frente a ella estaba la Triple Alianza: Alemania, Austria-Hungría e Italia.'),
    Q('valle', '🧑‍✈️', 'Estratega', 'Plan Schlieffen', '¿En qué consistía el plan Schlieffen de Alemania?', 'Derrotar rápido a Francia pasando por Bélgica y luego volverse contra Rusia', ['Atacar primero a Rusia y defenderse en Francia', 'Bombardear Londres desde el mar', 'Firmar la paz con Francia'], 'Fracasó en el Marne (1914) y la guerra se estancó.'),
    Q('frente', '💂', 'Veterano', 'Guerra de trincheras', '¿Qué caracterizó al frente occidental desde fines de 1914?', 'Una guerra de posiciones en trincheras casi sin avances', ['Grandes ofensivas de caballería', 'Una guerra naval', 'La rápida ocupación de París'], 'Ametralladoras y alambre de púas hacían muy costoso avanzar.'),
    Q('verdun', '🪖', 'Poilu francés', 'Batallas', '¿Qué batalla de 1916 se convirtió en símbolo de resistencia y desgaste entre Francia y Alemania?', 'Verdún', ['Waterloo', 'Stalingrado', 'Trafalgar'], 'Duró casi diez meses y dejó cientos de miles de muertos.'),
    Q('verdun', '😷', 'Enfermera', 'Nuevas armas', '¿Cuál de estas armas se usó de forma masiva por primera vez en esta guerra?', 'Los gases tóxicos', ['La bomba atómica', 'Los misiles balísticos', 'El radar'], 'Se usó gas cloro en Ypres (1915). También aparecieron tanques y aviones de combate.'),
    Q('oriental', '🧔', 'Campesino ruso', 'Entrada de EE.UU.', '¿Qué país entró a la guerra en 1917 tras la guerra submarina alemana?', 'Estados Unidos', ['Japón', 'España', 'Chile'], 'El hundimiento de barcos y el telegrama Zimmermann inclinaron a EE.UU. a favor de la Entente.'),
    Q('oriental', '🧑‍🌾', 'Soldado ruso', 'Salida de Rusia', '¿Qué tratado sacó a Rusia de la guerra en 1918?', 'Brest-Litovsk', ['Versalles', 'Sèvres', 'Locarno'], 'Tras la Revolución, los bolcheviques firmaron la paz con Alemania.'),
    Q('versalles', '🧑‍💼', 'Delegado', 'Tratado de Versalles', '¿Qué impuso el Tratado de Versalles (1919) a Alemania?', 'Reparaciones de guerra, pérdidas de territorio y reducción de su ejército', ['Anexar Austria y Polonia', 'Recibir colonias en África', 'Ocupar Francia'], 'Alemania debió aceptar la responsabilidad de la guerra: eso generó mucho resentimiento.'),
    Q('versalles', '🕊️', 'Pacifista', 'Orden de posguerra', '¿Qué organismo nació en 1919 para mantener la paz, por propuesta del presidente Wilson?', 'La Sociedad de las Naciones', ['La ONU', 'La OTAN', 'La Unión Europea'], 'Tuvo poco poder: EE.UU. ni siquiera ingresó a ella.'),
    // — ordenar letras (3) —
    U('frente', '👨‍✈️', 'General', 'Alianzas', 'Nombre de la alianza de Francia, Reino Unido y Rusia (7 letras)', 'ENTENTE'),
    U('verdun', '🕊️', 'Embajador', 'Fin de la guerra', 'Acuerdo que detuvo los combates el 11 de noviembre de 1918', 'ARMISTICIO'),
    U('sarajevo', '🏙️', 'Guía local', 'Causas de la guerra', 'Ciudad donde fue asesinado el archiduque', 'SARAJEVO'),
    // — sopa de letras (3) —
    F('frente', '🧑‍✈️', 'Soldado', 'Guerra de trincheras', 'Zanja donde los soldados vivían en el frente', 'TRINCHERA'),
    F('verdun', '🎖️', 'Coronel', 'Batallas', 'Batalla de 1916 con casi diez meses de duración', 'VERDUN'),
    F('valle', '🤝', 'Mensajero', 'Sistema de alianzas', 'Pactos entre países antes de la guerra', 'ALIANZAS'),
    // — respuesta escrita (3), corrige Gemini —
    W('valle', '🧐', 'Historiador', 'Causas de la guerra', '¿Por qué se dice que el sistema de alianzas convirtió un conflicto regional en una guerra mundial?', 'Cuando Austria-Hungría atacó a Serbia, las alianzas obligaron a Rusia, Alemania, Francia y el Reino Unido a intervenir en cadena, y el conflicto se extendió por Europa y el mundo.', [['alianza', 'pacto', 'bloque'], ['serbia', 'austria', 'sarajevo'], ['cadena', 'arrastr', 'obligar', 'apoy', 'defend', 'interven', 'entrar', 'extend']]),
    W('frente', '💂', 'Sargento', 'Guerra de trincheras', 'Explica qué fue la guerra de trincheras y por qué provocó un estancamiento en el frente.', 'Los ejércitos se enfrentaron desde zanjas fortificadas defendidas con ametralladoras, artillería y alambre de púas; atacar causaba enormes bajas, así que el frente casi no se movía.', [['trinchera', 'zanja'], ['ametralladora', 'alambre', 'artilleria', 'defens', 'fortific'], ['estanc', 'no avanz', 'inmov', 'bajas', 'muertos', 'sin avance']]),
    W('versalles', '📜', 'Cronista', 'Consecuencias', 'Menciona y explica dos consecuencias de la Primera Guerra Mundial.', 'Millones de muertos, la caída de los imperios alemán, austrohúngaro, ruso y otomano, nuevas fronteras en Europa, el Tratado de Versalles que humilló a Alemania y una profunda crisis económica.', [['muert', 'bajas', 'victimas'], ['imperio', 'cayo', 'cayeron', 'desaparec', 'monarqu'], ['frontera', 'territori', 'pais'], ['versalles', 'reparacion', 'humill', 'culpa'], ['crisis', 'econom', 'deuda']]),
  ],
};
