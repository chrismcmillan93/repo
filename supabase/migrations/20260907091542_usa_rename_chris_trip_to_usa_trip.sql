-- One-off rename: Chris asked for his trip's display name to drop the
-- year and just read "USA trip".
update usa.trips
set name = 'USA trip'
where id = '0ba65c3f-a86c-4321-8b22-6d777e387f1a' and name = 'USA 2027';
