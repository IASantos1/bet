#!/usr/bin/env node
/**
 * Push changes to GitHub using the REST API (no git CLI required).
 * Usage: node scripts/github-api-push.mjs "commit message"
 */

import { readFileSync } from 'fs';

const msg   = process.argv[2] || 'chore: atualização automática';
const token = process.env.GITHUB_TOKEN;
const OWNER = 'IASantos1';
const REPO  = 'BET62APOSTA';
const BRANCH = 'main';

if (!token) {
  console.error('❌ GITHUB_TOKEN não está definido.');
  process.exit(1);
}

const api = async (path, opts = {}) => {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}${path}`, {
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'BET62-Bot',
    },
    ...opts,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${JSON.stringify(body)}`);
  return body;
};

// Changed files to push (relative to repo root)
const FILES = [
  'src/react-app/components/SubOddsModel.tsx',
  'src/react-app/components/EventCard.tsx',
  'src/react-app/pages/EventDetails.tsx',
  'server/ws/liveWs.ts',
  'src/services/websocket/liveScoresWebSocket.ts',
];

(async () => {
  try {
    // 1. Get HEAD commit SHA
    const ref = await api(`/git/refs/heads/${BRANCH}`);
    const headSha = ref.object.sha;
    console.log(`📌 HEAD: ${headSha.slice(0, 8)}`);

    // 2. Get base tree SHA
    const commit = await api(`/git/commits/${headSha}`);
    const baseTreeSha = commit.tree.sha;

    // 3. Create blobs
    const treeEntries = [];
    for (const filePath of FILES) {
      let content;
      try { content = readFileSync(filePath, 'utf8'); } catch {
        console.warn(`⚠️  ${filePath} não encontrado, a saltar`);
        continue;
      }
      const blob = await api('/git/blobs', {
        method: 'POST',
        body: JSON.stringify({ content, encoding: 'utf-8' }),
      });
      treeEntries.push({ path: filePath, mode: '100644', type: 'blob', sha: blob.sha });
      console.log(`  📄 ${filePath}`);
    }

    // 4. Create tree
    const tree = await api('/git/trees', {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
    });

    // 5. Create commit
    const newCommit = await api('/git/commits', {
      method: 'POST',
      body: JSON.stringify({
        message: msg,
        tree: tree.sha,
        parents: [headSha],
        author: { name: 'BET62 Bot', email: 'bot@bet62.com', date: new Date().toISOString() },
      }),
    });
    console.log(`✅ Commit criado: ${newCommit.sha.slice(0, 8)} — ${msg}`);

    // 6. Update ref
    await api(`/git/refs/heads/${BRANCH}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: newCommit.sha, force: false }),
    });

    console.log(`🚀 Push concluído! https://github.com/${OWNER}/${REPO}`);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
})();
