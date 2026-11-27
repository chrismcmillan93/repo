-- Life app, Money: the USA trip savings goal becomes a pot (savings goal, linked to the goal), with the £1,500 already saved as
-- an opening deposit and the £500 a month from the goal's own title as the monthly amount. The goal itself is not changed
-- (its target, date and wording stay yours to edit). Idempotent: nothing happens if a pot is already linked to that goal.
with g as (
  select id, user_id from life.goals where title = 'Save £500 per month for USA trip' limit 1
), p as (
  insert into life.money_pots (user_id, name, kind, target, target_date, monthly_amount, goal_id, sort_order)
  select user_id, 'USA trip', 'saving', 4500, date '2027-04-30', 500, id, 0 from g
  where not exists (select 1 from life.money_pots m where m.goal_id = g.id)
  returning id, user_id
)
insert into life.money_deposits (user_id, pot_id, amount, deposited_on, note)
select user_id, id, 1500, date '2026-11-27', 'Opening balance' from p;
