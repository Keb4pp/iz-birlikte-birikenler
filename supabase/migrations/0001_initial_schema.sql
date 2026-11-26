create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Kullanıcı',
  created_at timestamptz not null default now()
);
create table public.shared_spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Birlikte',
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(8),'hex'),1,10)),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.shared_space_members (
  space_id uuid not null references public.shared_spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key(space_id,user_id)
);
create or replace function public.is_space_member(target uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.shared_space_members m where m.space_id=target and m.user_id=auth.uid()) $$;
create or replace function public.create_shared_space(space_name text default 'Birlikte')
returns uuid language plpgsql security definer set search_path=public
as $$ declare new_id uuid; begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  insert into public.shared_spaces(name,created_by) values (space_name,auth.uid()) returning id into new_id;
  insert into public.shared_space_members(space_id,user_id,role) values(new_id,auth.uid(),'owner');
  return new_id;
end $$;
create or replace function public.join_shared_space(code text)
returns uuid language plpgsql security definer set search_path=public
as $$ declare found_id uuid; begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select id into found_id from public.shared_spaces where invite_code=upper(trim(code));
  if found_id is null then raise exception 'invalid invite code'; end if;
  if (select count(*) from public.shared_space_members where space_id=found_id) >= 2 then raise exception 'space is full'; end if;
  insert into public.shared_space_members(space_id,user_id) values(found_id,auth.uid()) on conflict do nothing;
  return found_id;
end $$;

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.shared_spaces(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  title text not null,
  body text not null,
  happened_on date not null default current_date,
  visibility text not null check (visibility in ('shared','private')),
  location text,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.extracted_entities (
  id uuid primary key default gen_random_uuid(), space_id uuid not null references public.shared_spaces(id) on delete cascade,
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  lemma text not null, definition text, part_of_speech text, origin text, validation_status text not null default 'pending',
  source_quote text, created_at timestamptz not null default now(), unique(journal_entry_id,lemma)
);
create table public.semantic_relationships (
  id uuid primary key default gen_random_uuid(), space_id uuid not null references public.shared_spaces(id) on delete cascade,
  from_entity_id uuid not null references public.extracted_entities(id) on delete cascade,
  to_entity_id uuid not null references public.extracted_entities(id) on delete cascade,
  relation_type text not null, confidence numeric(4,3) not null check(confidence between 0 and 1), explanation text,
  created_at timestamptz not null default now(), unique(from_entity_id,to_entity_id,relation_type)
);
create table public.candidate_words (
  id uuid primary key default gen_random_uuid(), space_id uuid not null references public.shared_spaces(id) on delete cascade,
  lemma text not null, definition text, part_of_speech text, difficulty text check(difficulty in ('easy','medium','hard')),
  source_entry_ids uuid[] not null default '{}', validation_status text not null default 'pending', use_count integer not null default 0,
  last_used_at timestamptz, created_at timestamptz not null default now(), unique(space_id,lemma)
);
create table public.word_definitions (
  id uuid primary key default gen_random_uuid(), word_id uuid not null references public.candidate_words(id) on delete cascade,
  definition text not null, example_sentence text, source text, is_verified boolean not null default false
);
create table public.generated_questions (
  id uuid primary key default gen_random_uuid(), space_id uuid not null references public.shared_spaces(id) on delete cascade,
  word_id uuid not null references public.candidate_words(id), clue text not null, question_type text not null,
  difficulty text not null, quality_score integer not null check(quality_score between 0 and 100),
  critical_error boolean not null default false, review_status text not null default 'approved', created_at timestamptz not null default now()
);
create table public.question_quality_scores (
  id uuid primary key default gen_random_uuid(), question_id uuid not null references public.generated_questions(id) on delete cascade,
  semantic_accuracy integer not null, answer_clarity integer not null, logic integer not null, originality integer not null,
  difficulty_fit integer not null, language_quality integer not null, evaluator_version text not null, created_at timestamptz not null default now()
);
create table public.question_feedback (
  id uuid primary key default gen_random_uuid(), question_id uuid not null references public.generated_questions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  feedback text not null check(feedback in ('too_easy','just_right','too_hard','illogical','wrong_answer','duplicate')),
  created_at timestamptz not null default now(), unique(question_id,user_id)
);
create table public.game_sessions (
  id uuid primary key default gen_random_uuid(), space_id uuid not null references public.shared_spaces(id) on delete cascade,
  mode text not null check(mode in ('training','duel','cooperative')), status text not null default 'waiting',
  question_ids uuid[] not null default '{}', started_at timestamptz, created_at timestamptz not null default now()
);
create table public.match_players (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.game_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id), score integer not null default 0, finished_at timestamptz,
  unique(session_id,user_id)
);
create table public.player_game_states (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.game_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id), question_index integer not null default 0,
  main_deadline timestamptz, answer_deadline timestamptz, attempts integer not null default 0,
  revealed_positions integer[] not null default '{}', elapsed_seconds numeric not null default 0,
  updated_at timestamptz not null default now(), unique(session_id,user_id)
);
create table public.revealed_letters (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.game_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id), question_index integer not null, position integer not null,
  created_at timestamptz not null default now(), unique(session_id,user_id,question_index,position)
);
create table public.answer_attempts (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.game_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id), question_index integer not null, guess_hash text not null,
  is_correct boolean not null, created_at timestamptz not null default now()
);
create table public.crossword_puzzles (
  id uuid primary key default gen_random_uuid(), space_id uuid not null references public.shared_spaces(id) on delete cascade,
  size integer not null, grid jsonb not null, entry_ids uuid[] not null default '{}', status text not null default 'ready', created_at timestamptz not null default now()
);
create table public.crossword_entries (
  id uuid primary key default gen_random_uuid(), puzzle_id uuid not null references public.crossword_puzzles(id) on delete cascade,
  question_id uuid references public.generated_questions(id), answer_hash text not null, clue text not null,
  row_index integer not null, col_index integer not null, direction text not null check(direction in ('across','down'))
);
create table public.crossword_grid_cells (
  id uuid primary key default gen_random_uuid(), puzzle_id uuid not null references public.crossword_puzzles(id) on delete cascade,
  row_index integer not null, col_index integer not null, cell jsonb not null, unique(puzzle_id,row_index,col_index)
);
create table public.crossword_player_states (
  id uuid primary key default gen_random_uuid(), puzzle_id uuid not null references public.crossword_puzzles(id) on delete cascade,
  user_id uuid not null references auth.users(id), answers jsonb not null default '{}', updated_at timestamptz not null default now(),
  unique(puzzle_id,user_id)
);
create table public.game_results (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.game_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id), final_score integer not null, tie_break_reveals integer not null default 0,
  total_elapsed_seconds numeric not null default 0, created_at timestamptz not null default now(), unique(session_id,user_id)
);
create table public.personal_word_books (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  word_id uuid not null references public.candidate_words(id) on delete cascade, learned_at timestamptz not null default now(),
  review_count integer not null default 0, unique(user_id,word_id)
);
create table public.question_history (
  id uuid primary key default gen_random_uuid(), space_id uuid not null references public.shared_spaces(id) on delete cascade,
  session_id uuid references public.game_sessions(id) on delete set null, question_id uuid not null references public.generated_questions(id),
  used_at timestamptz not null default now()
);

-- Membership isolation: every user-owned/shared-space row is visible only to members.
do $$ declare t text; begin
 foreach t in array array['shared_space_members','journal_entries','extracted_entities','semantic_relationships','candidate_words','generated_questions','game_sessions','crossword_puzzles','question_history'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy %I on public.%I for select using (public.is_space_member(space_id))',t||'_member_select',t);
 end loop;
end $$;
alter table public.shared_spaces enable row level security;
create policy spaces_member_select on public.shared_spaces for select using (public.is_space_member(id));
alter table public.profiles enable row level security;
create policy profiles_self_select on public.profiles for select using (id=auth.uid());
create policy profiles_self_update on public.profiles for update using (id=auth.uid()) with check(id=auth.uid());

-- Writes for diary entries are restricted to the authenticated author and space members.
create policy journal_author_insert on public.journal_entries for insert with check(author_id=auth.uid() and public.is_space_member(space_id));
create policy journal_author_update on public.journal_entries for update using(author_id=auth.uid() and public.is_space_member(space_id)) with check(author_id=auth.uid() and public.is_space_member(space_id));
create policy journal_author_delete on public.journal_entries for delete using(author_id=auth.uid() and public.is_space_member(space_id));

-- User-private per-player records.
do $$ declare t text; begin
 foreach t in array array['match_players','player_game_states','revealed_letters','answer_attempts','question_feedback','crossword_player_states','game_results','personal_word_books'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy %I on public.%I for select using (user_id=auth.uid())',t||'_self_select',t);
 end loop;
end $$;
alter table public.word_definitions enable row level security;
alter table public.question_quality_scores enable row level security;
alter table public.crossword_entries enable row level security;
alter table public.crossword_grid_cells enable row level security;
create policy definitions_member_read on public.word_definitions for select using (exists(select 1 from public.candidate_words w where w.id=word_id and public.is_space_member(w.space_id)));
create policy quality_member_read on public.question_quality_scores for select using (exists(select 1 from public.generated_questions q where q.id=question_id and public.is_space_member(q.space_id)));
create policy crossword_entries_member_read on public.crossword_entries for select using (exists(select 1 from public.crossword_puzzles p where p.id=puzzle_id and public.is_space_member(p.space_id)));
create policy crossword_cells_member_read on public.crossword_grid_cells for select using (exists(select 1 from public.crossword_puzzles p where p.id=puzzle_id and public.is_space_member(p.space_id)));

-- Server-only game mutation functions should be SECURITY DEFINER and never expose answer hashes.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on public.profiles, public.shared_spaces, public.shared_space_members,
 public.journal_entries, public.question_feedback, public.personal_word_books, public.crossword_player_states to authenticated;
grant select on public.extracted_entities, public.semantic_relationships, public.candidate_words, public.word_definitions,
 public.generated_questions, public.question_quality_scores, public.game_sessions, public.match_players,
 public.player_game_states, public.crossword_puzzles, public.crossword_entries, public.crossword_grid_cells, public.question_history to authenticated;
grant execute on function public.create_shared_space(text), public.join_shared_space(text) to authenticated;
drop policy if exists journal_entries_member_select on public.journal_entries;
create policy journal_visibility_select on public.journal_entries for select
using (public.is_space_member(space_id) and (visibility='shared' or author_id=auth.uid()));
create policy question_feedback_insert on public.question_feedback for insert with check(user_id=auth.uid());
create policy word_book_self_insert on public.personal_word_books for insert with check(user_id=auth.uid());
create policy word_book_self_update on public.personal_word_books for update using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy crossword_state_self_write on public.crossword_player_states for all using(user_id=auth.uid()) with check(user_id=auth.uid());
