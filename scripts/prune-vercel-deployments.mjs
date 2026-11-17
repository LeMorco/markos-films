#!/usr/bin/env node
/**
 * Limpia los despliegues antiguos de un proyecto de Vercel.
 *
 * Conserva los MAX_DEPLOYMENTS más recientes y borra los anteriores, con dos
 * excepciones que no se tocan nunca:
 *   - el despliegue de producción actual (el más reciente listo en producción),
 *   - cualquier despliegue que tenga un dominio/alias asignado.
 *
 * Variables de entorno:
 *   VERCEL_TOKEN      (obligatoria) token de Vercel con acceso al proyecto.
 *   VERCEL_PROJECT    (obligatoria) nombre o id del proyecto.
 *   VERCEL_TEAM_SLUG  slug del equipo (por defecto no se usa ninguno).
 *   VERCEL_TEAM_ID    id del equipo; tiene prioridad sobre el slug.
 *   MAX_DEPLOYMENTS   cuántos conservar (por defecto 15).
 *   DRY_RUN           "true" para solo mostrar lo que se borraría.
 */

const API = 'https://api.vercel.com';

const token = (process.env.VERCEL_TOKEN || '').trim();
const teamSlug = (process.env.VERCEL_TEAM_SLUG || '').trim();
const configuredTeamId = (process.env.VERCEL_TEAM_ID || '').trim();
const projectNameOrId = (process.env.VERCEL_PROJECT || '').trim();
const maxDeployments = Number.parseInt(process.env.MAX_DEPLOYMENTS || '15', 10);
const dryRun = /^(1|true|yes|si|sí)$/i.test((process.env.DRY_RUN || '').trim());

let teamId = configuredTeamId || null;

function fail(message) {
  console.error(`\n✕ ${message}\n`);
  process.exit(1);
}

if (!token) {
  fail('Falta VERCEL_TOKEN. Crea un token en https://vercel.com/account/tokens y guárdalo como secreto del repositorio.');
}
if (!projectNameOrId) {
  fail('Falta VERCEL_PROJECT. Indica el nombre o el id del proyecto de Vercel.');
}
if (!Number.isFinite(maxDeployments) || maxDeployments < 1) {
  fail(`MAX_DEPLOYMENTS no es válido ("${process.env.MAX_DEPLOYMENTS}"). Debe ser un número entero mayor que 0.`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(path, { method = 'GET', query, useTeam = true } = {}) {
  const url = new URL(API + path);
  const params = { ...query };
  if (teamId && useTeam) params.teamId = teamId;
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // respuesta no JSON: se muestra el texto en el error
  }

  if (!response.ok) {
    const detail = data?.error?.message || data?.message || text.slice(0, 300) || response.statusText;
    const error = new Error(`${method} ${path} → ${response.status} ${detail}`);
    error.status = response.status;
    throw error;
  }

  return data;
}

async function resolveTeamId() {
  if (configuredTeamId) return configuredTeamId;
  if (!teamSlug) return null;

  const data = await api('/v2/teams', { query: { limit: 100 } });
  const teams = Array.isArray(data?.teams) ? data.teams : [];
  const wanted = teamSlug.toLowerCase();
  const team = teams.find(
    (item) => (item.slug || '').toLowerCase() === wanted || (item.name || '').toLowerCase() === wanted,
  );

  if (!team) {
    const available = teams.map((item) => item.slug).filter(Boolean).join(', ') || '(ninguno)';
    throw new Error(
      `No encuentro el equipo "${teamSlug}". Equipos disponibles para este token: ${available}. ` +
        'Revisa VERCEL_TEAM_SLUG o usa VERCEL_TEAM_ID.',
    );
  }

  return team.id;
}

async function resolveProject() {
  try {
    return await api(`/v9/projects/${encodeURIComponent(projectNameOrId)}`);
  } catch (error) {
    if (error.status !== 404) throw error;
  }

  /* A veces el proyecto se ha renombrado o está en la cuenta personal y no
     en el equipo. Se busca por nombre normalizado en ambos ámbitos. */
  const normalizar = (valor) => String(valor || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const buscado = normalizar(projectNameOrId);
  const ambitos = [];
  if (teamId) ambitos.push({ useTeam: true, etiqueta: 'equipo' });
  ambitos.push({ useTeam: false, etiqueta: 'cuenta personal' });
  const disponibles = [];

  for (const ambito of ambitos) {
    let proyectos = [];
    try {
      const datos = await api('/v9/projects', {
        query: { limit: 100 },
        useTeam: ambito.useTeam,
      });
      proyectos = Array.isArray(datos?.projects) ? datos.projects : [];
    } catch (error) {
      console.log(`  · No se pudieron listar los proyectos de la ${ambito.etiqueta}: ${error.message}`);
      continue;
    }

    for (const proyecto of proyectos) {
      disponibles.push(`${proyecto.name} (${ambito.etiqueta})`);
    }

    const encontrado = proyectos.find((proyecto) =>
      proyecto.id === projectNameOrId ||
      proyecto.name === projectNameOrId ||
      normalizar(proyecto.name) === buscado
    );

    if (encontrado) {
      if (!ambito.useTeam) teamId = null;
      console.log(
        `  · Proyecto encontrado como "${encontrado.name}" en la ${ambito.etiqueta}.` +
        (encontrado.name !== projectNameOrId ? ' Se usará ese nombre.' : '')
      );
      return encontrado;
    }
  }

  const lista = Array.from(new Set(disponibles)).join(', ') || '(no se pudo listar ninguno)';
  throw new Error(
    `No encuentro el proyecto "${projectNameOrId}". ` +
      `Proyectos disponibles para este token: ${lista}. ` +
      'Revisa VERCEL_PROJECT, VERCEL_TEAM_SLUG/VERCEL_TEAM_ID y que el token tenga acceso.'
  );
}

function createdMs(deployment) {
  return deployment.createdAt ?? deployment.created ?? 0;
}

function formatDate(deployment) {
  const ms = createdMs(deployment);
  if (!ms) return 'fecha desconocida';
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function describe(deployment) {
  const url = deployment.url ? `https://${deployment.url}` : deployment.uid;
  const target = deployment.target ? ` [${deployment.target}]` : '';
  return `${deployment.uid}  ${formatDate(deployment)}  ${url}${target}`;
}

async function listDeployments(projectId) {
  const deployments = [];
  const seen = new Set();
  let until;

  // La API devuelve como máximo 100 por página. Se pide la primera y se sigue
  // hacia atrás con `until`; los solapamientos se descartan por uid.
  for (let page = 0; page < 20; page += 1) {
    const data = await api('/v6/deployments', {
      query: { projectId, limit: 100, until },
    });

    const batch = Array.isArray(data?.deployments) ? data.deployments : [];
    let added = 0;

    for (const deployment of batch) {
      if (deployment?.uid && !seen.has(deployment.uid)) {
        seen.add(deployment.uid);
        deployments.push(deployment);
        added += 1;
      }
    }

    if (batch.length < 100 || added === 0) break;

    const nextUntil = createdMs(batch[batch.length - 1]);
    if (!nextUntil || nextUntil === until) break;
    until = nextUntil;
  }

  return deployments.sort((a, b) => createdMs(b) - createdMs(a));
}

async function aliasesOf(deploymentId) {
  const data = await api(`/v2/deployments/${encodeURIComponent(deploymentId)}/aliases`, {
    query: { limit: 100 },
  });
  return Array.isArray(data?.aliases) ? data.aliases : [];
}

async function main() {
  console.log('Vercel · limpieza de despliegues');
  console.log(dryRun ? 'Modo simulación: no se borrará nada.' : 'Modo real: se borrarán los despliegues sobrantes.');

  teamId = await resolveTeamId();
  const project = await resolveProject();

  console.log(
    `Proyecto: ${project.name || projectNameOrId} (${project.id})` +
      (teamId ? ` · equipo: ${teamSlug || teamId}` : ' · cuenta personal'),
  );

  const deployments = await listDeployments(project.id);
  console.log(`Despliegues encontrados: ${deployments.length} · a conservar: ${maxDeployments}`);

  if (deployments.length <= maxDeployments) {
    console.log(`\n✓ Nada que borrar: hay ${deployments.length} y el límite es ${maxDeployments}.`);
    return;
  }

  const keep = new Set(deployments.slice(0, maxDeployments).map((item) => item.uid));

  // Producción actual: el despliegue de producción más reciente que esté listo.
  // Si ninguno está listo, se protege el más reciente de producción igualmente.
  const production =
    deployments.find((item) => item.target === 'production' && item.readyState === 'READY') ||
    deployments.find((item) => item.target === 'production');
  if (production) keep.add(production.uid);

  const candidates = deployments.filter((item) => !keep.has(item.uid));

  console.log(`\nConservados (${keep.size}):`);
  for (const deployment of deployments.filter((item) => keep.has(item.uid))) {
    console.log(`  · ${describe(deployment)}`);
  }
  if (production) {
    console.log(`  → producción actual protegida: ${production.uid}`);
  }

  console.log(`\nCandidatos a borrar (${candidates.length}):`);
  for (const deployment of candidates) {
    console.log(`  · ${describe(deployment)}`);
  }
  console.log('');

  let deleted = 0;
  let wouldDelete = 0;
  let skipped = 0;
  let failed = 0;

  for (const deployment of candidates) {
    const label = describe(deployment);

    // Un despliegue con alias/dominio propio no se toca.
    const knownAliases = Array.isArray(deployment.alias) ? deployment.alias : [];
    if (knownAliases.length > 0) {
      console.log(`↷ Omito ${label}: tiene dominio asignado (${knownAliases.join(', ')}).`);
      skipped += 1;
      continue;
    }

    // Tampoco se intenta borrar algo que todavía se está construyendo.
    if (['BUILDING', 'QUEUED', 'INITIALIZING'].includes(deployment.readyState)) {
      console.log(`↷ Omito ${label}: todavía está ${deployment.readyState}.`);
      skipped += 1;
      continue;
    }

    let aliases;
    try {
      aliases = await aliasesOf(deployment.uid);
    } catch (error) {
      console.warn(`↷ Omito ${label}: no he podido comprobar sus dominios (${error.message}).`);
      skipped += 1;
      continue;
    }

    if (aliases.length > 0) {
      const names = aliases.map((item) => item.alias || item.uid).filter(Boolean).join(', ');
      console.log(`↷ Omito ${label}: tiene dominio asignado (${names}).`);
      skipped += 1;
      continue;
    }

    if (dryRun) {
      console.log(`· Borraría ${label}`);
      wouldDelete += 1;
      continue;
    }

    try {
      await api(`/v13/deployments/${encodeURIComponent(deployment.uid)}`, { method: 'DELETE' });
      console.log(`✓ Borrado ${label}`);
      deleted += 1;
    } catch (error) {
      console.error(`✕ No he podido borrar ${label}: ${error.message}`);
      failed += 1;
    }

    await sleep(250);
  }

  console.log('\nResumen');
  if (dryRun) {
    console.log(`  · ${wouldDelete} se borrarían (simulación)`);
  } else {
    console.log(`  · ${deleted} borrados`);
  }
  console.log(`  · ${skipped} omitidos por dominio o por estar en construcción`);
  if (failed > 0) console.log(`  · ${failed} errores`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail(error?.message || String(error));
});
