-- Race results: the finish time is now free text (kept exactly as typed: "52:14", "1h 52m", "4:12:30 chip"), so any keyboard
-- works. `finish_time_seconds` stays for older results and for text that is clearly a time, but is no longer required.
-- A result needs one or the other. Existing rows (seconds only) satisfy the check unchanged.
alter table fitness.race_results alter column finish_time_seconds drop not null;
alter table fitness.race_results add column finish_time_text text;
alter table fitness.race_results add constraint race_results_time_present
  check (finish_time_seconds is not null or (finish_time_text is not null and char_length(btrim(finish_time_text)) > 0));
alter table fitness.race_results add constraint race_results_time_text_len check (finish_time_text is null or char_length(finish_time_text) <= 40);
