import { describe, expect, it } from 'vitest';
import { exportRouteToGpx } from '../gpx';
import type { Coord3D } from '../../types';

describe('gpx.ts export and XML escaping', () => {
  it('generates valid GPX 1.1 with escaped special characters and elevation tags', () => {
    const coords: Coord3D[] = [
      [-47.862638, -15.798967, 1059.4],
      [-47.895675, -15.756582, 1070.2],
    ];
    const gpx = exportRouteToGpx('Esplanada & "Asa Norte" <DF>', coords, "Rota do 'Eixo'");
    expect(gpx).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(gpx).toContain('<gpx version="1.1" creator="EixoVerde"');
    expect(gpx).toContain('Esplanada &amp; &quot;Asa Norte&quot; &lt;DF&gt;');
    expect(gpx).toContain('Rota do &apos;Eixo&apos;');
    expect(gpx).toContain('<trkpt lat="-15.798967" lon="-47.862638"><ele>1059.4</ele></trkpt>');
    expect(gpx).toContain('<trkpt lat="-15.756582" lon="-47.895675"><ele>1070.2</ele></trkpt>');
  });

  it('omits <ele> tag cleanly when coordinates lack elevation', () => {
    const coords: Coord3D[] = [
      [-47.88, -15.79],
      [-47.89, -15.78],
    ];
    const gpx = exportRouteToGpx('Teste 2D', coords);
    expect(gpx).not.toContain('<ele>');
    expect(gpx).toContain('<trkpt lat="-15.790000" lon="-47.880000"></trkpt>');
  });
});
