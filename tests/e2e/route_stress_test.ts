import { readFileSync } from 'node:fs';
import { PRESET_VEHICLES } from '../../src/data/vehicles';
import { buildLaneSpatialIndex } from '../../src/engine/geo';
import { planMultiProfileRoutes, reverseGeocode, searchPlaces } from '../../src/engine/routing';
import { computeRouteTelemetry } from '../../src/engine/telemetry';
import type { LngLat } from '../../src/types';

interface RouteCase {
  region: 'DF' | 'Brasil';
  name: string;
  from: LngLat;
  to: LngLat;
  minKm: number;
  maxKm: number;
}

const CASES: RouteCase[] = [
  // === 12 Brasília DF Corridors ===
  { region: 'DF', name: 'SGAN 912 → Parque da Cidade', from: [-47.8992, -15.7524], to: [-47.9052, -15.8026], minKm: 4.5, maxKm: 13 },
  { region: 'DF', name: 'Esplanada → SHCGN 711 Norte', from: [-47.8626, -15.799], to: [-47.8956, -15.7566], minKm: 6, maxKm: 13 },
  { region: 'DF', name: 'UnB → Pontão do Lago Sul', from: [-47.8707, -15.7634], to: [-47.8712, -15.8266], minKm: 7, maxKm: 18 },
  { region: 'DF', name: 'Asa Sul (SQS 114) → Catedral', from: [-47.9165, -15.8295], to: [-47.8755, -15.7983], minKm: 5, maxKm: 12 },
  { region: 'DF', name: 'Noroeste (Burle Marx) → UnB', from: [-47.911, -15.744], to: [-47.8707, -15.7634], minKm: 4, maxKm: 11 },
  { region: 'DF', name: 'Sudoeste → Torre de TV', from: [-47.9255, -15.799], to: [-47.8929, -15.7905], minKm: 3, maxKm: 9 },
  { region: 'DF', name: 'Ponte JK → Pontão do Lago Sul', from: [-47.8315, -15.824], to: [-47.8712, -15.8266], minKm: 5, maxKm: 17 },
  { region: 'DF', name: 'Lago Norte (Deck Norte) → 711 Norte', from: [-47.8832, -15.7195], to: [-47.8956, -15.7566], minKm: 4, maxKm: 12 },
  { region: 'DF', name: 'Águas Claras → ParkShopping (Guará)', from: [-48.0273, -15.8336], to: [-47.9554, -15.8336], minKm: 7, maxKm: 16 },
  { region: 'DF', name: 'Jardim Botânico → Ponte JK', from: [-47.8328, -15.8705], to: [-47.8295, -15.823], minKm: 4.5, maxKm: 14 },
  { region: 'DF', name: 'Rodoviária → Parque da Cidade', from: [-47.8826, -15.7936], to: [-47.9052, -15.8026], minKm: 2, maxKm: 7 },
  { region: 'DF', name: 'Taguatinga Centro → Águas Claras', from: [-48.0566, -15.8338], to: [-48.0273, -15.8336], minKm: 2.5, maxKm: 9 },

  // === 6 Major Brazilian Cities ===
  { region: 'Brasil', name: 'São Paulo: Av. Paulista → Ibirapuera', from: [-46.6559, -23.5614], to: [-46.6576, -23.5874], minKm: 2.5, maxKm: 8 },
  { region: 'Brasil', name: 'Rio de Janeiro: Copacabana → Lagoa', from: [-43.1829, -22.9711], to: [-43.2108, -22.9719], minKm: 2.5, maxKm: 9 },
  { region: 'Brasil', name: 'Curitiba: Parque Barigui → Jardim Botânico', from: [-49.3081, -25.4264], to: [-49.2385, -25.4429], minKm: 6, maxKm: 15 },
  { region: 'Brasil', name: 'Belo Horizonte: Pç. Liberdade → Pampulha', from: [-43.938, -19.932], to: [-43.9789, -19.8584], minKm: 8, maxKm: 18 },
  { region: 'Brasil', name: 'Florianópolis: Beira-Mar → Ponte Hercílio Luz', from: [-48.5453, -27.5844], to: [-48.5656, -27.5936], minKm: 2, maxKm: 8 },
  { region: 'Brasil', name: 'Recife: Marco Zero → Boa Viagem', from: [-34.8711, -8.0631], to: [-34.8998, -8.1265], minKm: 6, maxKm: 15 },
];

const GEOCODE_QUERIES = [
  { query: 'Parque da Cidade Brasília', expect: 'Parque' },
  { query: 'Parque Ibirapuera São Paulo', expect: 'Ibirapuera' },
  { query: 'Copacabana Rio de Janeiro', expect: 'Copacabana' },
  { query: 'Jardim Botânico Curitiba', expect: 'Curitiba' },
  { query: 'Praça da Liberdade Belo Horizonte', expect: 'Liberdade' },
  { query: 'Beira-Mar Norte Florianópolis', expect: 'Florianópolis' },
];

async function main() {
  const lanes = JSON.parse(readFileSync('./public/data/ciclomapa-df-lanes.geojson', 'utf-8'));
  buildLaneSpatialIndex(lanes);

  const jet = PRESET_VEHICLES[0];
  let passed = 0;
  let failed = 0;

  console.log('=== 1. MULTI-CITY ROUTING STRESS TEST (18 REAL ROUTES) ===');
  for (const tc of CASES) {
    try {
      const cands = await planMultiProfileRoutes([tc.from, tc.to], tc.name.split('→')[0].trim(), tc.name.split('→')[1]?.trim());
      const top = cands[0];
      const ok =
        Boolean(top) &&
        top.source !== 'custom' &&
        top.coords.length >= 10 &&
        top.distanceKm >= tc.minKm &&
        top.distanceKm <= tc.maxKm &&
        top.maneuvers.length >= 2;
      const tel = top ? computeRouteTelemetry(top, jet, 1, 75, false) : null;
      const tag = ok ? 'PASS' : 'FAIL';
      if (ok) passed++;
      else failed++;
      console.log(
        `[${tag}] [${tc.region}] ${tc.name} — ${cands.length} opts | ${top?.source} | ${top?.distanceKm} km | ${tel?.oneWayMin} min | ${top?.surfaces.safetyScore}% seg. | ${top?.crossings.length} trav. (${top?.crossings.map((x) => x.shortTag).join(',') || 'none'})`
      );
    } catch (err) {
      failed++;
      console.log(`[FAIL] [${tc.region}] ${tc.name} — ERROR: ${String(err)}`);
    }
  }

  console.log('\n=== 2. NATIONWIDE GEOCODING & REVERSE GEOCODING TEST ===');
  for (const gq of GEOCODE_QUERIES) {
    const res = await searchPlaces(gq.query);
    const ok = res.length > 0 && res.some((p) => (p.name + ' ' + p.subtitle).toLowerCase().includes(gq.expect.toLowerCase()));
    if (ok) passed++;
    else failed++;
    console.log(`[${ok ? 'PASS' : 'FAIL'}] Geocode "${gq.query}" -> ${res[0]?.name} (${res[0]?.subtitle}) [${res[0]?.source}]`);
  }

  const rev = await reverseGeocode([-47.8992, -15.7524]);
  const revOk = Boolean(rev.name && (rev.city || rev.district));
  if (revOk) passed++;
  else failed++;
  console.log(`[${revOk ? 'PASS' : 'FAIL'}] Reverse Geocode SGAN 912 -> ${rev.name} | ${rev.district || '-'}, ${rev.city || '-'}`);

  console.log(`\n=== ROUTE STRESS SUMMARY: ${passed}/${passed + failed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) process.exit(1);
}

void main();
