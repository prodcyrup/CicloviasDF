import type { LngLat } from '../types';

export interface ArterialCorridor {
  id: string;
  name: string;
  shortTag: string;
  danger: 'alta' | 'media';
  delaySec: number;
  note: string;
  coords: LngLat[]; // [lng, lat]
}

/**
 * Major Brasília DF high-speed arterial corridors for perpendicular crossing detection.
 * A crossing warning is raised ONLY when a route cuts across a corridor transversely
 * (verified on both local segment and 70m macro route chord) and placed ~45m upstream
 * so riders are alerted BEFORE entering the avenue.
 */
export const DF_ARTERIAL_CORRIDORS: ArterialCorridor[] = [
  {
    id: 'l2-norte',
    name: 'Travessia Via L2 Norte',
    shortTag: 'L2N',
    danger: 'alta',
    delaySec: 55,
    note: 'Cruzamento transversal na Via L2 Norte. Atenção aos veículos em velocidade.',
    coords: [
      [-47.8751, -15.7918],
      [-47.8748, -15.7875],
      [-47.8751, -15.7835],
      [-47.8757, -15.7745],
      [-47.8774, -15.7653],
      [-47.8798, -15.757],
      [-47.8832, -15.747],
    ],
  },
  {
    id: 'l2-sul',
    name: 'Travessia Via L2 Sul',
    shortTag: 'L2S',
    danger: 'alta',
    delaySec: 55,
    note: 'Cruzamento transversal na Via L2 Sul. Utilize o semáforo ou faixa de pedestres.',
    coords: [
      [-47.878, -15.8037],
      [-47.885, -15.8107],
      [-47.8942, -15.8198],
      [-47.9031, -15.8265],
      [-47.9105, -15.8318],
      [-47.9214, -15.8396],
    ],
  },
  {
    id: 'eixao-norte',
    name: 'Travessia Eixão Norte',
    shortTag: 'EIXÃO N',
    danger: 'alta',
    delaySec: 95,
    note: 'Cruzamento do Eixo Rodoviário Norte (80 km/h) e eixinhos. Use a passagem subterrânea ou faixa segura.',
    coords: [
      [-47.8812, -15.7934],
      [-47.8806, -15.7837],
      [-47.8814, -15.7745],
      [-47.8836, -15.7653],
      [-47.8862, -15.757],
      [-47.8895, -15.747],
    ],
  },
  {
    id: 'eixao-sul',
    name: 'Travessia Eixão Sul',
    shortTag: 'EIXÃO S',
    danger: 'alta',
    delaySec: 95,
    note: 'Cruzamento do Eixo Rodoviário Sul (80 km/h). Utilize a passagem subterrânea de pedestres/ciclistas.',
    coords: [
      [-47.8818, -15.7942],
      [-47.886, -15.806],
      [-47.8925, -15.815],
      [-47.901, -15.825],
      [-47.911, -15.836],
      [-47.921, -15.847],
    ],
  },
  {
    id: 'w3-norte',
    name: 'Travessia Av. W3 Norte',
    shortTag: 'W3N',
    danger: 'alta',
    delaySec: 60,
    note: 'Cruzamento da Av. W3 Norte (faixa exclusiva de ônibus e tráfego intenso). Use o semáforo.',
    coords: [
      [-47.8884, -15.792],
      [-47.8876, -15.7834],
      [-47.8883, -15.7745],
      [-47.8904, -15.7653],
      [-47.893, -15.757],
      [-47.8962, -15.747],
    ],
  },
  {
    id: 'w3-sul',
    name: 'Travessia Av. W3 Sul',
    shortTag: 'W3S',
    danger: 'alta',
    delaySec: 60,
    note: 'Cruzamento da Av. W3 Sul (corredor de ônibus). Respeite o semáforo e faixa de pedestres.',
    coords: [
      [-47.891, -15.796],
      [-47.898, -15.808],
      [-47.906, -15.819],
      [-47.916, -15.83],
      [-47.927, -15.842],
    ],
  },
  {
    id: 'via-n1',
    name: 'Travessia Via N1 (Eixo Monumental)',
    shortTag: 'N1',
    danger: 'alta',
    delaySec: 50,
    note: 'Travessia transversal na Via N1 (Esplanada). Redobre a atenção nas faixas de alta velocidade.',
    coords: [
      [-47.8616, -15.7996],
      [-47.8725, -15.7962],
      [-47.8832, -15.7928],
      [-47.895, -15.789],
      [-47.915, -15.7828],
    ],
  },
  {
    id: 'via-s1',
    name: 'Travessia Via S1 (Eixo Monumental Sul)',
    shortTag: 'S1',
    danger: 'alta',
    delaySec: 50,
    note: 'Travessia transversal na Via S1 (Eixo Monumental sentido Esplanada). Use a faixa semafórica.',
    coords: [
      [-47.8626, -15.8017],
      [-47.8738, -15.798],
      [-47.8848, -15.7946],
      [-47.896, -15.791],
      [-47.916, -15.7848],
    ],
  },
  {
    id: 'l4-norte',
    name: 'Travessia Via L4 Norte',
    shortTag: 'L4N',
    danger: 'alta',
    delaySec: 55,
    note: 'Travessia na Via L4 Norte (tráfego rápido). Utilize passarela ou semáforo.',
    coords: [
      [-47.8615, -15.798],
      [-47.8665, -15.784],
      [-47.869, -15.77],
      [-47.8715, -15.755],
    ],
  },
  {
    id: 'l4-sul',
    name: 'Travessia Via L4 Sul',
    shortTag: 'L4S',
    danger: 'alta',
    delaySec: 55,
    note: 'Travessia na Via L4 Sul (Setor de Clubes / Orla Sul). Tráfego rápido; prefira passarela ou faixa sinalizada.',
    coords: [
      [-47.8687, -15.8141],
      [-47.877, -15.8215],
      [-47.8875, -15.8295],
      [-47.898, -15.8375],
      [-47.9095, -15.8455],
    ],
  },
  {
    id: 'epig',
    name: 'Travessia EPIG (Parque da Cidade)',
    shortTag: 'EPIG',
    danger: 'media',
    delaySec: 45,
    note: 'Cruzamento da Estrada Parque Indústrias Gráficas (EPIG). Prefira a passarela ou faixa semafórica.',
    coords: [
      [-47.9055, -15.7928],
      [-47.9175, -15.7938],
      [-47.9315, -15.7945],
      [-47.948, -15.7965],
    ],
  },
  {
    id: 'epia',
    name: 'Travessia EPIA (DF-003)',
    shortTag: 'EPIA',
    danger: 'alta',
    delaySec: 90,
    note: 'Rodovia EPIA (tráfego expresso e caminhões). Utilize exclusivamente passarelas ou viadutos com ciclovia.',
    coords: [
      [-47.9345, -15.7495],
      [-47.933, -15.762],
      [-47.9392, -15.7787],
      [-47.9494, -15.7978],
      [-47.949, -15.814],
      [-47.9545, -15.8385],
    ],
  },
  {
    id: 'eptg',
    name: 'Travessia EPTG (DF-085)',
    shortTag: 'EPTG',
    danger: 'alta',
    delaySec: 85,
    note: 'Estrada Parque Taguatinga (via expressa com faixa exclusiva de ônibus). Atravesse apenas em passarelas.',
    coords: [
      [-47.948, -15.8102],
      [-47.9767, -15.8107],
      [-47.9945, -15.8108],
      [-48.0121, -15.8171],
      [-48.0262, -15.8246],
      [-48.0366, -15.8301],
      [-48.0501, -15.8318],
    ],
  },
  {
    id: 'epdb',
    name: 'Travessia EPDB (Lago Sul)',
    shortTag: 'EPDB',
    danger: 'media',
    delaySec: 50,
    note: 'Estrada Parque Dom Bosco (Lago Sul). Redobre a atenção nas rotatórias e acessos às QIs.',
    coords: [
      [-47.8313, -15.8343],
      [-47.8364, -15.8372],
      [-47.8404, -15.8413],
      [-47.8456, -15.8423],
      [-47.8544, -15.8454],
      [-47.8566, -15.8525],
      [-47.8725, -15.856],
    ],
  },
  {
    id: 'eppr',
    name: 'Travessia EPPR / Ponte do Bragueto',
    shortTag: 'EPPR',
    danger: 'alta',
    delaySec: 70,
    note: 'Acesso Lago Norte / Ponte do Bragueto (fluxo intenso). Utilize a ciclovia segregada da ponte.',
    coords: [
      [-47.8904, -15.7425],
      [-47.8895, -15.731],
      [-47.8845, -15.7225],
      [-47.875, -15.7165],
      [-47.8645, -15.7195],
    ],
  },
];
