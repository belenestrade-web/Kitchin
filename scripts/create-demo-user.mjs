import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');
for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');

const EMAIL = 'demo@kitchin.app';
const PASSWORD = 'Demo2026!';
const TIENDA_ID = '00000000-0000-0000-0000-000000000001';
const NOMBRE = 'Admin Demo';
const ROL = 'admin';

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find(x => x.email?.toLowerCase() === email.toLowerCase());
    if (u) return u;
    if (data.users.length < 200) return null;
  }
  return null;
}

let userId;
const created = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
});
if (created.error) {
  if (/already|registered|exists/i.test(created.error.message)) {
    const existing = await findUserByEmail(EMAIL);
    if (!existing) throw new Error(`createUser falló y no encuentro al usuario: ${created.error.message}`);
    userId = existing.id;
    console.log(`auth.users: ya existía (id=${userId}). Reseteo password…`);
    const upd = await admin.auth.admin.updateUserById(userId, { password: PASSWORD, email_confirm: true });
    if (upd.error) throw upd.error;
  } else {
    throw created.error;
  }
} else {
  userId = created.data.user.id;
  console.log(`auth.users: creado (id=${userId}).`);
}

const { error: tErr } = await admin
  .from('tiendas')
  .upsert({
    id: TIENDA_ID,
    nombre: 'Cocinas Demo',
    color_primario: '#1E5FA8',
    iva_porcentaje: 21,
    email_contacto: 'demo@kitchin.app',
    telefono: '+34 600 000 000',
    condiciones_comerciales: 'Presupuesto válido 30 días. Precios IVA no incluido. Pago: 50% al firmar, 50% en la entrega.',
  }, { onConflict: 'id' });
if (tErr) throw tErr;
console.log(`public.tiendas: upsert ok (id=${TIENDA_ID}).`);

const { error: upErr } = await admin
  .from('usuarios')
  .upsert({ id: userId, tienda_id: TIENDA_ID, nombre: NOMBRE, email: EMAIL, rol: ROL }, { onConflict: 'id' });
if (upErr) throw upErr;
console.log(`public.usuarios: upsert ok (rol=${ROL}, tienda_id=${TIENDA_ID}).`);
console.log('\nListo. Login: demo@kitchin.app / Demo2026!');
