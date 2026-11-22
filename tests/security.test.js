// Run with: npm test   (uses Node's built-in test runner, no extra dependencies)
process.env.SESSION_SECRET = 'test-secret-for-unit-tests-only';

const test = require('node:test');
const assert = require('node:assert/strict');

const { signId, verifySignature } = require('../utils/hashUtils');
const { requireAdminOrOwnerApi, requireAdminOnlyApi } = require('../middlewares/apiAuth');

function run(guard, teacher) {
  const req = { teacher };
  const res = {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; }
  };
  let nextCalled = false;
  guard(req, res, () => { nextCalled = true; });
  return { nextCalled, res };
}

test('signed links: valid signature passes, tampered/wrong-length/missing fail', () => {
  const id = '665f1c2e8b1c2d3e4f5a6b7c';
  const sig = signId(id);
  assert.equal(verifySignature(id, sig), true);
  assert.equal(verifySignature(id, sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0')), false);
  assert.equal(verifySignature(id, sig.slice(0, 10)), false);
  assert.equal(verifySignature(id, ''), false);
  assert.equal(verifySignature('665f1c2e8b1c2d3e4f5a6b7d', sig), false);
});

test('API role guard: admin-only allows only admin', () => {
  assert.equal(run(requireAdminOnlyApi, { role: 'admin' }).nextCalled, true);
  for (const role of ['teacher', 'owner', undefined]) {
    const { nextCalled, res } = run(requireAdminOnlyApi, { role });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  }
  assert.equal(run(requireAdminOnlyApi, undefined).res.statusCode, 403);
});

test('API role guard: admin-or-owner rejects plain teachers', () => {
  assert.equal(run(requireAdminOrOwnerApi, { role: 'admin' }).nextCalled, true);
  assert.equal(run(requireAdminOrOwnerApi, { role: 'owner' }).nextCalled, true);
  const { nextCalled, res } = run(requireAdminOrOwnerApi, { role: 'teacher' });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('privileged API routes are all guarded', () => {
  const src = require('node:fs').readFileSync(require.resolve('../routes/api/teacherRoutes.js'), 'utf8');
  const mustBeAdminOnly = ["post('/teachers'", "put('/teachers/:id'", "delete('/teachers/:id'", "delete('/students/:id'", "get('/reports/audit'"];
  const mustBeAdminOrOwner = ["post('/batches'", "put('/batches/:id'", "post('/fees'", "get('/fees'", "post('/bulk_save'"];
  for (const r of mustBeAdminOnly) assert.ok(src.includes(`router.${r}, requireAdminOnlyApi`), `unguarded: ${r}`);
  for (const r of mustBeAdminOrOwner) assert.ok(src.includes(`router.${r}, requireAdminOrOwnerApi`), `unguarded: ${r}`);
});

test('seo pages: facts used in schema are consistent with the page data', () => {
  const { PAGES, BANDS } = require('../utils/seoPages');
  assert.equal(PAGES.length, 4);
  for (const p of PAGES) {
    assert.ok(p.title.length <= 70, `${p.slug} title too long`);
    assert.ok(p.description.length <= 165, `${p.slug} description too long`);
    for (const b of p.bands) assert.ok(BANDS[b], `${p.slug} unknown band ${b}`);
    assert.ok(p.faqs.length >= 3);
  }
});
