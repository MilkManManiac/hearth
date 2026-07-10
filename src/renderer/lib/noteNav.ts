import { useStore } from '../store'

/** "kols-tower" → "Kols Tower" — the default title when a link creates its target. */
function humanizeRef(ref: string): string {
  return ref.replace(/-+/g, ' ').replace(/\b\p{L}/gu, (c) => c.toUpperCase())
}

/**
 * Navigate to a linked note (the run-mode right panel auto-follows; build mode
 * also flips the left rail to Notes). An unresolved ref CREATES the note first
 * — wiki convention: a link is never a dead end.
 */
export async function openNoteLink(ref: string): Promise<void> {
  let st = useStore.getState()
  let id = ref
  if (!st.campaign.notes.some((n) => n.id === ref)) {
    const created = await st.createNoteInline('note', humanizeRef(ref))
    if (!created) return
    id = created
    st = useStore.getState()
  }
  st.selectNote(id)
  if (st.uiMode === 'build') st.setLeftTab('notes')
}
