-- supabase/migrations/0003_enable_realtime.sql
-- postgres_changes イベントを受け取るためにテーブルをパブリケーションへ登録する
-- これがないと supabase.channel().on('postgres_changes', ...) が無音で動作しない

ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE events;
