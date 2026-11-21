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
 * A crossing warning is raised ONLY when a route cuts across a corridor transversely (>= 38 deg).
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
      [-47.8774, -15.802],
      [-47.876, -15.795],
      [-47.8755, -15.791],
      [-47.8758, -15.78525],
      [-47.8766, -15.7745],
      [-47.8789, -15.7653],
      [-47.8815, -15.757],
      [-47.8848, -15.747],
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
      [-47.886, -15.806],
      [-47.8825, -15.7934],
      [-47.882, -15.7837],
      [-47.8826, -15.7745],
      [-47.8849, -15.7653],
      [-47.8875, -15.757],
      [-47.8908, -15.747],
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
      [-47.8895, -15.792],
      [-47.8886, -15.7834],
      [-47.8892, -15.7745],
      [-47.8915, -15.7653],
      [-47.894, -15.757],
      [-47.8973, -15.747],
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
      [-47.8605, -15.8005],
      [-47.8725, -15.7966],
      [-47.8832, -15.7932],
      [-47.895, -15.7895],
      [-47.915, -15.7835],
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
    id: 'epig',
    name: 'Travessia EPIG (Parque da Cidade)',
    shortTag: 'EPIG',
    danger: 'media',
    delaySec: 45,
    note: 'Cruzamento da Estrada Parque Indústrias Gráficas (EPIG). Prefira a passarela ou faixa semafórica.',
    coords: [
      [-47.901, -15.798],
      [-47.916, -15.7975],
      [-47.932, -15.797],
      [-47.948, -15.7968],
    ],
  },
];
