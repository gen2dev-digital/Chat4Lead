=== TEST ROUTES API COMPLÈTES ===

1. GET /api/conversations → total: 14, returned: 3, hasMore: true
2. GET /api/conversations?status=ACTIVE → total: 14
3. POST /init → conversationId: 779919cb-821e-4329-bf5c-8f389759bfbe, isNew: true
4. GET /conversation/:id → status: ACTIVE, messages: 0
5. POST /message → reply length: 294, score: 10
6. POST /message (empty) → status: 400 (expected 400)
7. POST /message (bad UUID) → status: 400 (expected 400)
8. PATCH /close → success: true, status: CLOSED
9. GET after close → status: CLOSED (expected CLOSED)
10. GET /conversations (no key) → status: 401 (expected 401)

=== TOUS LES TESTS TERMINÉS ===