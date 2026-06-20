-- supabase/migrations/0002_add_insert_policies.sql

create policy "Users can insert messages into their own conversations"
  on messages for insert
  with check (
    exists (
      select 1 from conversations
      where conversations.id = messages.conversation_id
      and conversations.user_id = auth.uid()
    )
  );

create policy "Users can insert events into their own conversations"
  on events for insert
  with check (
    exists (
      select 1 from conversations
      where conversations.id = events.conversation_id
      and conversations.user_id = auth.uid()
    )
  );
