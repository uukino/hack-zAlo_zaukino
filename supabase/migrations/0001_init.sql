-- supabase/migrations/0001_init.sql

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  personality text not null,
  created_at timestamptz default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) not null,
  role text not null check (role in ('system', 'user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) not null,
  type text not null,
  transcript text,
  created_at timestamptz default now()
);

-- RLS有効化
alter table conversations enable row level security;
alter table messages enable row level security;
alter table events enable row level security;

-- 自分の会話のみ参照・操作可能にするポリシー
create policy "Users can view their own conversations"
  on conversations for select
  using (auth.uid() = user_id);

create policy "Users can insert their own conversations"
  on conversations for insert
  with check (auth.uid() = user_id);

create policy "Users can view messages of their own conversations"
  on messages for select
  using (
    exists (
      select 1 from conversations
      where conversations.id = messages.conversation_id
      and conversations.user_id = auth.uid()
    )
  );

create policy "Users can view events of their own conversations"
  on events for select
  using (
    exists (
      select 1 from conversations
      where conversations.id = events.conversation_id
      and conversations.user_id = auth.uid()
    )
  );
