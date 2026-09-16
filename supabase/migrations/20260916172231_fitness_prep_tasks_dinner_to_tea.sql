-- North England: "dinner" -> "tea" for the evening meal, everywhere it
-- appears in plan content (prep task titles/descriptions, shopping list
-- item name + notes). Also splits each prep task's description onto two
-- lines at the Lunch/Tea boundary (a literal newline -- css/styles.css's
-- .tick-notes renders it with white-space: pre-line) instead of running
-- both meals together in one sentence.

update fitness.prep_tasks set title = replace(title, 'lunch + dinner', 'lunch + tea');

update fitness.prep_tasks set description = replace(description, '. Dinner:', E'.\nTea:');

update fitness.shopping_list_items set item = replace(item, 'Dinner protein', 'Tea protein');

update fitness.shopping_list_items set notes = replace(notes, 'dinner', 'tea') where notes ilike '%dinner%';
