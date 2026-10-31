-- Same stale "from Tue 29 Sept" note on weeks 5-8's Tuesday easy run
-- (Muay Thai actually started 6 Oct now) -- simplify to an ongoing note
-- rather than a specific start date that's no longer accurate.
update fitness.run_plan set detail = 'Easy run PM. Muay Thai AM (Johnsons, 6-7am).'
  where id in ('4b979ca3-117a-47d8-a976-f9eb1603eea9', 'edd739e3-5d95-418e-9f77-e5324b77b31f',
    '1a09f0b8-9970-4942-a2d0-f2c20854cc90', '67300b4a-1146-4516-a7ac-aa0170ed5987');
