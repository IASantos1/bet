// Implementação simples de Levenshtein Distance para Fuzzy Matching
// Fonte: Baseada em algoritmos padrão de distância de edição

export function levenshteinDistance(a: string, b: string): number {
  const matrix = [];

  // Inicializar primeira linha e coluna
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Preencher matriz
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // Substituição
          Math.min(
            matrix[i][j - 1] + 1,   // Inserção
            matrix[i - 1][j] + 1    // Remoção
          )
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

export function similarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  const longerLength = longer.length;

  if (longerLength === 0) {
    return 1.0;
  }

  return (longerLength - levenshteinDistance(longer, shorter)) / parseFloat(String(longerLength));
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remover acentos
    .replace(/[^a-z0-9\s]/g, '')     // Remover caracteres especiais
    .trim();
}

export function isMatch(name1: string, name2: string, threshold = 0.7): boolean {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);
  
  if (n1 === n2) return true;
  if (n1.includes(n2) || n2.includes(n1)) return true; // Contém

  return similarity(n1, n2) >= threshold;
}
