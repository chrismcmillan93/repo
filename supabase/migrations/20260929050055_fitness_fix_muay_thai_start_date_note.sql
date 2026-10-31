-- Week 4 Tuesday's run_plan.detail still said Muay Thai starts "from Tue 29
-- Sept" -- stale now that it's been pushed back to this date (6 Oct).
update fitness.run_plan set detail = 'Easy run PM. Muay Thai AM (Johnsons, 6-7am) starts today.'
  where id = '1a85659c-01e5-448c-89e6-cffeaf99db69';
