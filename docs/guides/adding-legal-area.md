# Como Adicionar uma Área do Direito

> Em produção, áreas do direito são definidas no frontend TypeScript.

## 1. Adicionar constante
Em `frontend/src/lib/constants.ts`, adicionar a nova área ao mapa de labels e cores:
```typescript
export const LEGAL_AREA_LABELS: Record<string, string> = {
  // ... áreas existentes ...
  nova_area: 'Direito Nova Área',
}

export const LEGAL_AREA_COLORS: Record<string, string> = {
  // ... cores existentes ...
  nova_area: 'emerald', // cor Tailwind
}
```

## 2. Atualizar classificação
Em `frontend/src/lib/classification-data.ts`, adicionar a área à árvore de classificação com seus respectivos assuntos e tipos.

## 3. Atualizar Firestore types
Em `frontend/src/lib/firestore-types.ts`, atualizar o tipo `AdminLegalArea` se necessário.

## 4. Testar
- Verificar que a área aparece no formulário de criação de documento
- Verificar que os badges de cor são exibidos corretamente
- Verificar que a área funciona na classificação de acervo

## 5. Admin Panel
A área também pode ser adicionada via Admin Panel → Áreas do Direito (CRUD), que salva no Firestore.
