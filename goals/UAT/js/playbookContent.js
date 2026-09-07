// Static reference content for the Playbook section — 6 pillars, 24 books,
// each with its actionable directives. Sourced from the field manual PDF the
// user uploaded. This never changes per-user, so unlike everything else in
// the app it isn't a Supabase table — it ships with the code, the same way
// blankData.js ships example data. Only the user's per-directive status/note/
// linked-goal (see db.js's playbook* functions) is real, saved data.
//
// Every directive gets a stable key (`${book.key}-${two-digit index}`) used
// as the primary key in goals.playbook_progress — never change an existing
// book's `key` or reorder its directives, or past progress will silently
// detach from the directive it was tracking.

export const PILLARS = [
  {
    key: 'mindset-stoicism', numeral: 'I', title: 'Mindset & Stoicism',
    blurb: "You don't control events — only your judgment of them. Every book in this section is a variation on that one lever.",
    books: [
      {
        key: 'meditations', title: 'Meditations', author: 'Marcus Aurelius', year: 'c. 180 AD',
        focus: 'Mindset / Stoic Philosophy',
        blurb: "A Roman emperor's private journal of reasoning himself back to virtue — proof that self-mastery isn't a state you arrive at, but a discipline repeated every morning. Core argument: disturbance comes from your judgment about events, not the events themselves.",
        directives: [
          { text: 'Separate the event from the judgment.', detail: 'Before reacting to a setback, name what part is fact and what part is your interpretation, then respond to the fact only.' },
          { text: 'Write a morning brief to yourself.', detail: 'Each morning, name the specific friction or difficult people you expect that day, so irritation never arrives as a surprise.' },
          { text: 'Treat obstacles as material, not injury.', detail: 'When blocked, ask what the obstacle lets you practice — patience, resourcefulness, restraint — instead of asking why it happened to you.' },
          { text: 'Rehearse loss in advance.', detail: 'Periodically picture losing something you value, not to be morbid, but so gratitude and calm precede the actual event rather than panic.' },
          { text: 'Answer insults with a question, not a defense.', detail: "When criticized, privately check whether the charge is true before responding; a true charge is information, a false one is noise." },
          { text: 'Review your day at night without self-flattery.', detail: 'Before sleep, name one moment you acted from reason and one where you acted from impulse, without decorating either.' },
          { text: 'Do the next right action, not the whole plan.', detail: 'When overwhelmed, narrow your attention to the single task in front of you and perform it well.' },
          { text: 'Remember your mortality to set priorities.', detail: "Let your finite time decide, in the moment, whether an argument or a grudge actually deserves the hours you're about to give it." }
        ]
      },
      {
        key: 'obstacle-is-the-way', title: 'The Obstacle Is the Way', author: 'Ryan Holiday', year: '2014',
        focus: 'Mindset / Applied Stoicism',
        blurb: 'Translates ancient Stoic philosophy into a modern operating manual: the impediment to action advances action. Perception, will, and action are three disciplines you train so adversity becomes fuel rather than a verdict on your prospects.',
        directives: [
          { text: 'Strip the emotional adjective from the problem.', detail: 'Restate a setback in flat, factual terms instead of the dramatized version, because the drama is the part you added.' },
          { text: 'Convert "why me" into "what now."', detail: 'The moment you catch yourself asking why, redirect the same breath into naming the next concrete action available.' },
          { text: 'Do the unglamorous task first.', detail: 'Identify the least appealing but most necessary step in a project and schedule it before anything easier.' },
          { text: 'Use failure as a live rehearsal.', detail: 'After a loss, write down the specific decision point that caused it, so the next attempt is a corrected experiment, not a repeated guess.' },
          { text: "Persist through the middle, not just the start.", detail: 'Set a pre-committed minimum effort threshold before you\'re allowed to judge whether something is "working."' },
          { text: 'Turn a setback into a demonstration.', detail: 'When something goes publicly wrong, put deliberate effort into how you recover — people remember that more than the failure.' },
          { text: 'Lower your attachment to a single outcome.', detail: 'Hold a backup path for any high-stakes attempt before you start, so a closed door narrows your options instead of ending them.' }
        ]
      },
      {
        key: 'twelve-rules-for-life', title: '12 Rules for Life', author: 'Jordan B. Peterson', year: '2018',
        focus: 'Mindset / Personal Responsibility',
        blurb: "Argues psychological and social order emerges from the accumulation of small individual disciplines, and that a person who can't manage their own life has no standing to blame the world for its chaos. Voluntary responsibility, not comfort, is what gives a life stability.",
        directives: [
          { text: 'Fix one visible piece of disorder today.', detail: 'Pick the single most neglected corner of your life and correct it fully before starting anything more ambitious.' },
          { text: 'Compare yourself to who you were yesterday.', detail: 'Replace ranking yourself against others with a private daily log of one thing done better or worse than the day before.' },
          { text: 'Say what you actually mean.', detail: 'Before agreeing to a plan to keep the peace, state the honest answer instead, even at the cost of short-term friction.' },
          { text: 'Correct your posture and presence deliberately.', detail: "Notice when you're shrinking in a room and consciously reset your voice, eye contact, and stance." },
          { text: 'Choose friends who want you to improve.', detail: 'Audit your closest relationships for whether each one supports your discipline or enables your worst habits.' },
          { text: 'Set a rule before you set a goal.', detail: 'When starting something new, write the non-negotiable boundary first — rules survive bad days better than motivation does.' },
          { text: 'Speak precisely instead of staying vague.', detail: 'In conflict, name the specific behavior and its effect rather than a general accusation.' }
        ]
      },
      {
        key: 'mans-search-for-meaning', title: "Man's Search for Meaning", author: 'Viktor Frankl', year: '1946',
        focus: 'Mindset / Meaning & Resilience',
        blurb: 'Drawn from Frankl\'s survival of Nazi concentration camps: the primary human drive is meaning, not pleasure or power — a strong enough "why" lets a person endure almost any "how." Even stripped of every external freedom, the freedom to choose your attitude remains.',
        directives: [
          { text: 'Name your specific "why" in writing.', detail: "Write the concrete person or purpose you're enduring hardship for, so a hard day can be measured against that reason." },
          { text: 'Locate the gap between stimulus and response.', detail: 'In a moment of provocation, deliberately insert a pause before reacting, and choose a response that serves your purpose.' },
          { text: 'Find meaning inside unavoidable suffering.', detail: "When facing hardship you can't change, ask what stance or growth you can still choose within it." },
          { text: 'Turn future orientation into present discipline.', detail: 'Picture the specific future version of yourself who succeeded, and let that image dictate one behavior today.' },
          { text: 'Treat work as contribution, not just income.', detail: 'Identify one person your work actually helps, and let that — not the paycheck — be your daily motivator.' },
          { text: 'Refuse to let circumstance dictate your values.', detail: "In situations with no control over outcomes, choose in advance which values you won't compromise regardless of pressure." }
        ]
      }
    ]
  },
  {
    key: 'health-discipline-grit', numeral: 'II', title: 'Health, Discipline & Grit',
    blurb: 'The body is the training ground for the mind. Every rep, cold morning, and early alarm is a rehearsal for how you handle everything else.',
    books: [
      {
        key: 'cant-hurt-me', title: "Can't Hurt Me", author: 'David Goggins', year: '2018',
        focus: 'Discipline / Mental Toughness',
        blurb: 'Goggins\' transformation from an abused, overweight young man into a Navy SEAL and ultra-endurance athlete, arguing the mind quits long before the body does. His "40% Rule": when you feel done, you\'ve typically used only 40 percent of your actual capacity.',
        directives: [
          { text: 'Apply the 40% Rule to your next quitting point.', detail: "The next time you want to stop, commit to 10 more minutes or reps past the urge before you're allowed to decide." },
          { text: 'Keep an "accountability mirror."', detail: 'Write your specific excuses on a note by your mirror and read them aloud daily until the behavior changes, not just the discomfort.' },
          { text: 'Callous your mind through chosen discomfort.', detail: 'Schedule one voluntarily uncomfortable physical task per week purely to practice not negotiating with yourself.' },
          { text: 'Turn past pain into a fuel log.', detail: 'Write down a specific past humiliation and use it as a reference point during a hard set, instead of suppressing the memory.' },
          { text: 'Take the "cookie jar" inventory.', detail: 'Before a major challenge, list three past moments you overcame something hard, and pull one out any time you want to quit.' },
          { text: 'Stop negotiating with your alarm.', detail: 'Set a wake-up time and rise at the first alarm for 30 days straight, treating snooze as a rule violation.' },
          { text: 'Volunteer for the task nobody wants.', detail: "Take on the assignment your group is avoiding, specifically because that's where your comfort zone is hiding." },
          { text: 'Track effort, not just outcome.', detail: 'Keep a private log rating your actual effort after each session, and treat a low effort score as the real failure.' }
        ]
      },
      {
        key: 'discipline-equals-freedom', title: 'Discipline Equals Freedom', author: 'Jocko Willink', year: '2017',
        focus: 'Discipline / Self-Leadership',
        blurb: 'A former Navy SEAL commander argues discipline isn\'t the opposite of freedom but its source — the disciplined man earns options the undisciplined one never has. Written as short, blunt directives meant to be acted on immediately, not contemplated.',
        directives: [
          { text: 'Win the first hour of the day.', detail: 'Wake earlier than required and use that margin for training or planning before anyone else makes demands on you.' },
          { text: 'Default to action over analysis.', detail: 'Once a decision is sufficiently thought through, execute immediately — further deliberation is usually procrastination in disguise.' },
          { text: 'Treat your body as mission-critical equipment.', detail: 'Schedule training as a non-negotiable calendar block, the same priority as a meeting you cannot miss.' },
          { text: 'Break the goal into the next ten minutes.', detail: 'Execute only the smallest sub-task you can start right now, rather than waiting to feel ready for the whole thing.' },
          { text: 'Detach from outcome mid-crisis.', detail: 'When a plan goes wrong, state the problem in one sentence and give the next order to yourself calmly.' },
          { text: 'Extreme-own every failure before assigning blame.', detail: 'After something goes wrong, write the specific decision you made that contributed to it first.' },
          { text: 'Simplify the plan under pressure.', detail: 'When things get complicated, cut your intended actions down to the two or three that matter most.' }
        ]
      },
      {
        key: 'outlive', title: 'Outlive', author: 'Peter Attia', year: '2023',
        focus: 'Health / Longevity Science',
        blurb: 'Argues modern medicine reacts to the "Four Horsemen" — heart disease, cancer, neurodegeneration, metabolic dysfunction — after they appear, when the real leverage is decades earlier. Exercise, sleep, and nutrition reframed as the highest-leverage preventive medicine available.',
        directives: [
          { text: 'Train for your "Centenarian Decathlon."', detail: 'Identify the physical tasks you want to still perform at 80, and reverse-engineer today\'s training from that target.' },
          { text: 'Build a strength floor, not just cardio.', detail: 'Add two dedicated resistance sessions per week focused on compound lifts — grip and muscle mass predict longevity.' },
          { text: 'Protect Zone 2 cardio time weekly.', detail: "Schedule several hours of easy, sustained aerobic effort to build the mitochondrial base high intensity alone doesn't build." },
          { text: 'Treat sleep as a medical intervention.', detail: "Set a fixed sleep and wake window and defend it the way you'd defend a prescribed medication." },
          { text: 'Get ahead of metabolic markers early.', detail: 'Request bloodwork on markers like ApoB in your 30s and 40s rather than waiting for symptoms.' },
          { text: 'Train balance and stability on purpose.', detail: 'Add single-leg and stability work specifically to reduce fall risk decades from now.' },
          { text: 'Define your "marginal decade" now.', detail: 'Write what you want your final ten years to physically look like, and let that decide what you train for today.' }
        ]
      },
      {
        key: 'the-comfort-crisis', title: 'The Comfort Crisis', author: 'Michael Easter', year: '2021',
        focus: 'Health / Discomfort & Resilience',
        blurb: 'Argues modern convenience has removed nearly all friction from daily life, quietly driving anxiety and lost resilience. Built around a 33-day Arctic hunt: deliberately reintroducing scarcity and physical strain restores capacities comfort has eroded.',
        directives: [
          { text: 'Schedule a "misogi" once a year.', detail: 'Pick one extremely difficult physical challenge annually with roughly a 50% chance of failure.' },
          { text: 'Practice being bored on purpose.', detail: 'Leave your phone behind for a walk once a week and let your mind wander unstimulated.' },
          { text: 'Walk further than convenient, regularly.', detail: 'Replace one short car trip a week with an hour-long walk as a deliberate stressor.' },
          { text: 'Carry weight over distance.', detail: 'Add a weighted backpack to a regular walk or hike once a week to combine cardio and load-bearing strength.' },
          { text: 'Practice hunger instead of eliminating it.', detail: 'Let yourself go a few hours past your normal eating time occasionally and notice the sensation without fixing it.' },
          { text: 'Choose the harder, slower option when available.', detail: 'When a shortcut and an effortful option both solve a problem, default to the effortful one.' }
        ]
      }
    ]
  },
  {
    key: 'wealth-finance', numeral: 'III', title: 'Wealth & Finance',
    blurb: 'Wealth is what you keep and compound, not what you earn or display. Behavior beats intelligence here, every time.',
    books: [
      {
        key: 'psychology-of-money', title: 'The Psychology of Money', author: 'Morgan Housel', year: '2020',
        focus: 'Finance / Behavioral Money Psychology',
        blurb: 'Argues financial success is a soft skill, driven by behavior and temperament far more than intelligence or formulas — how you feel about money matters more than what you know. Doing reasonably well consistently beats doing brilliantly occasionally.',
        directives: [
          { text: 'Set a savings rate independent of income growth.', detail: 'Fix a percentage of every raise to go directly to savings before your lifestyle can absorb it.' },
          { text: 'Define "enough" in writing.', detail: 'Write the specific number or lifestyle that would satisfy you, so ambition has a stopping point.' },
          { text: 'Build a margin of safety into every plan.', detail: 'Add a buffer to your financial plan specifically to survive being wrong, not just unlucky.' },
          { text: 'Judge decisions by process, not outcome.', detail: 'After a win or loss, write whether the decision was sound at the time, separate from how it turned out.' },
          { text: 'Automate your investing.', detail: "Set up automatic contributions on a fixed schedule so compounding doesn't depend on your mood about the market." },
          { text: 'Hold through boredom, not just downturns.', detail: "Pre-commit to a minimum multi-year holding period so ordinary boredom isn't mistaken for a sell signal." },
          { text: "Separate your money story from someone else's.", detail: 'Before copying a strategy you admire, check whether their goals and timeline actually match yours.' }
        ]
      },
      {
        key: 'rich-dad-poor-dad', title: 'Rich Dad Poor Dad', author: 'Robert Kiyosaki', year: '1997',
        focus: 'Finance / Asset Mindset',
        blurb: 'Contrasts two father figures to argue financial education, not formal schooling, determines whether you work for money or make money work for you. Core distinction: assets put money in your pocket, liabilities take it out, regardless of appearances.',
        directives: [
          { text: 'Audit purchases as assets or liabilities.', detail: 'Before a major purchase, classify it honestly by whether it generates income or drains it monthly.' },
          { text: 'Pay yourself first, literally.', detail: 'Move a set amount into savings the moment income arrives, before paying any other bill.' },
          { text: 'Buy income-producing assets before status liabilities.', detail: 'Redirect a status-purchase budget toward an asset that produces cash flow until that asset can fund the purchase itself.' },
          { text: 'Treat financial literacy as an ongoing skill.', detail: "Set aside weekly time to study a financial topic you don't understand, rather than assuming common sense covers it." },
          { text: 'Use debt as a tool, evaluated by purpose.', detail: 'Before taking on debt, classify it as funding an asset or a liability.' },
          { text: "Start a side business to learn the owner's mindset.", detail: 'Take on one small income-generating project outside your job specifically to practice thinking like an owner.' }
        ]
      },
      {
        key: 'think-and-grow-rich', title: 'Think and Grow Rich', author: 'Napoleon Hill', year: '1937',
        focus: 'Finance & Mindset / Achievement Psychology',
        blurb: 'Based on interviews with early-20th-century self-made millionaires: wealth begins as a definite, burning desire converted into a specific plan. The gap between those who achieve big goals and those who don\'t is the intensity and specificity of that initial desire.',
        directives: [
          { text: 'Write a specific, dated financial goal.', detail: "State the exact amount, the exact date, and what you'll give in return, then read it aloud twice daily." },
          { text: 'Form a "mastermind" of two or more people.', detail: 'Meet regularly with others pursuing similarly ambitious goals, rather than working in isolation.' },
          { text: 'Convert every setback into a lesson before moving on.', detail: 'After a failure, write the specific advantage hidden in it before allowing yourself to feel discouraged.' },
          { text: 'Make a decision and set a deadline.', detail: "For any pending choice you've been avoiding, set a firm decision date this week." },
          { text: 'Name your specific fear in writing.', detail: "An unnamed fear controls you more than a named one — write down exactly what you're afraid of." },
          { text: 'Visualize the goal, then act same-day.', detail: 'Picture the goal as accomplished, but require it be followed immediately by one concrete action toward it.' },
          { text: 'Choose your five closest associations deliberately.', detail: 'Replace habitual contact with anyone who consistently discourages your ambition.' }
        ]
      },
      {
        key: 'the-millionaire-next-door', title: 'The Millionaire Next Door', author: 'Thomas J. Stanley & William D. Danko', year: '1996',
        focus: 'Finance / Wealth-Building Behavior',
        blurb: 'Based on research into actual millionaire households: most live well below their means and prioritize savings over status. Wealth is what you accumulate, not what you spend — and the two are often inversely related.',
        directives: [
          { text: 'Calculate your expected net worth formula.', detail: 'Multiply age by pre-tax income, divide by 10, and compare it honestly to your actual net worth.' },
          { text: 'Budget before you buy, every time.', detail: 'Set a discretionary spending category in advance and check purchases against it, rather than deciding case by case.' },
          { text: 'Choose a modest home relative to income.', detail: "Cap housing cost at a fixed percentage of income well below what you're approved for." },
          { text: "Stop financing your children's adult lifestyle.", detail: "If you're regularly funding adult children's expenses, set a firm cutoff date and communicate it." },
          { text: 'Track your spending by category monthly.', detail: 'Keep an actual written log of where money goes each month, not an approximation.' },
          { text: 'Pick a business or career for its economics, not its prestige.', detail: "Weight actual income and ownership potential higher than the title's perceived status." }
        ]
      }
    ]
  },
  {
    key: 'relationships-intimacy', numeral: 'IV', title: 'Relationships & Intimacy',
    blurb: 'Say what you mean, ask what you need, and give attention on purpose. Indirectness is the quiet killer of every relationship in this section.',
    books: [
      {
        key: 'way-of-the-superior-man', title: 'The Way of the Superior Man', author: 'David Deida', year: '1997',
        focus: 'Relationships / Masculine Purpose',
        blurb: "Argues a man's ability to show up fully in relationships is inseparable from whether he's living in alignment with a mission bigger than his own comfort. Frames masculine growth as choosing your deepest purpose and living from it, even under emotional pressure.",
        directives: [
          { text: "Name your life's mission in one sentence.", detail: 'Write the specific purpose you\'re moving toward outside the relationship, and revisit it monthly.' },
          { text: 'Stay present instead of placating during conflict.', detail: "When your partner is upset, practice staying present without immediately trying to fix or escape the feeling." },
          { text: 'Keep commitments to yourself before commitments to others.', detail: "Maintain one personal discipline even when a partner's mood pressures you to drop it." },
          { text: 'Communicate desire directly, not through hints.', detail: 'State what you want plainly rather than expecting a partner to infer it.' },
          { text: "Don't outsource your emotional stability.", detail: "Before reacting to your partner's mood, check whether you're regulating yourself or waiting for her to regulate you." },
          { text: 'Choose depth of attention over frequency of reassurance.', detail: 'Give full, undistracted attention for a set period daily, rather than scattered attention all day.' }
        ]
      },
      {
        key: 'how-to-win-friends', title: 'How to Win Friends and Influence People', author: 'Dale Carnegie', year: '1936',
        focus: 'Relationships / Social Skill',
        blurb: 'Argues most people are starved for genuine appreciation, and the fastest way to influence anyone is sincere interest in them, not winning the argument. Criticism rarely changes behavior; honest appreciation and understanding consistently do.',
        directives: [
          { text: "Learn and use a person's name deliberately.", detail: 'Use it at least twice in conversation and again when parting.' },
          { text: 'Ask questions before offering opinions.', detail: 'In your next disagreement, ask two clarifying questions before stating your own position.' },
          { text: 'Give honest appreciation before any criticism.', detail: 'State one specific, true thing you appreciate before raising a problem, so the correction lands as feedback.' },
          { text: 'Let the other person feel the idea was theirs.', detail: 'Phrase a suggestion as a question that leads them toward it, rather than a directive.' },
          { text: 'Admit your own mistakes quickly.', detail: 'State it plainly and immediately, before the other person has to point it out.' },
          { text: "Talk in terms of the other person's interest.", detail: 'Frame a request in terms of what they get, not just what you need.' },
          { text: 'Let the other person save face.', detail: 'Correct someone privately rather than in front of a group, regardless of how clearly they were wrong.' },
          { text: 'Begin disagreements by finding agreement first.', detail: 'State one thing you agree with before stating where you differ.' }
        ]
      },
      {
        key: 'no-more-mr-nice-guy', title: 'No More Mr. Nice Guy', author: 'Robert Glover', year: '2000',
        focus: 'Relationships / Boundaries & Authenticity',
        blurb: 'Argues men raised to believe "good" means "liked" suppress their needs and avoid conflict — a pattern that makes affection feel conditional. Approval-seeking is a covert contract ("if I\'m good, I\'ll get love") that quietly breeds resentment.',
        directives: [
          { text: 'State a preference instead of deferring.', detail: 'In your next low-stakes decision, state your actual preference first rather than defaulting to "whatever you want."' },
          { text: 'Identify your "covert contracts."', detail: "Write down where you're being helpful expecting something unstated in return, and either state it or drop it." },
          { text: 'Say no without justifying it at length.', detail: 'Decline with a short, clear no, without a paragraph defending your right to.' },
          { text: 'Ask for what you want directly.', detail: 'State a specific want in plain language instead of hinting and waiting to be noticed.' },
          { text: 'Stop hiding minor flaws out of fear of disapproval.', detail: 'Disclose a small mistake directly rather than managing how it will be perceived.' },
          { text: "Set one boundary you've been avoiding this week.", detail: 'Identify a recurring situation where you feel resentment and state the boundary out loud.' },
          { text: 'Seek approval from yourself first.', detail: "Before asking someone's opinion of a decision you've already made, check whether you're seeking information or permission." }
        ]
      },
      {
        key: 'attached', title: 'Attached', author: 'Amir Levine & Rachel Heller', year: '2010',
        focus: 'Relationships / Attachment Theory',
        blurb: 'Applies adult attachment theory to romance, arguing relationship conflict follows predictable patterns based on whether each partner is secure, anxious, or avoidant. Attachment needs are legitimate, not "needy," and a secure relationship meets them directly.',
        directives: [
          { text: 'Identify your own attachment style honestly.', detail: 'Note your typical pattern under relationship stress and name it accurately.' },
          { text: 'State needs directly instead of testing your partner.', detail: 'Replace an indirect test with a direct statement of what you need.' },
          { text: 'Recognize deactivating strategies in yourself.', detail: 'If avoidant-leaning, notice when you create distance right after intimacy increases, and name the pattern.' },
          { text: 'Practice effective communication during conflict.', detail: 'State the specific behavior, its effect on you, and what you need, instead of a global complaint.' },
          { text: 'Choose partners for security compatibility, not just attraction.', detail: 'Notice whether a new partner can stay present during minor conflict, not just easy moments.' },
          { text: 'Repair actively after a rupture.', detail: 'Initiate a specific repair conversation within 24 hours rather than waiting for things to feel normal again.' }
        ]
      }
    ]
  },
  {
    key: 'focus-productivity', numeral: 'V', title: 'Focus & Productivity',
    blurb: "You don't rise to your goals, you fall to your systems. This section is about building the systems and cutting everything else.",
    books: [
      {
        key: 'atomic-habits', title: 'Atomic Habits', author: 'James Clear', year: '2018',
        focus: 'Productivity / Habit Formation',
        blurb: "Argues meaningful change comes from small, consistent systems, not dramatic goal-setting — habits form through a cycle of cue, craving, response, and reward that can be deliberately engineered. You don't rise to the level of your goals, you fall to the level of your systems.",
        directives: [
          { text: 'Make the cue obvious with implementation intentions.', detail: 'Write your next habit as "I will [behavior] at [time] in [location]," not a vague intention.' },
          { text: 'Stack new habits onto existing ones.', detail: 'Attach a new small habit directly after an existing automatic one instead of anchoring it to a random time.' },
          { text: 'Make good habits easier to start.', detail: 'Reduce the friction of the first two minutes of a habit rather than optimizing the full session.' },
          { text: 'Make bad habits harder to access.', detail: "Add one deliberate step of friction to a habit you're breaking instead of relying on willpower alone." },
          { text: 'Track the habit, not just the outcome.', detail: 'Keep a visible streak or checklist marking each day you did the behavior.' },
          { text: 'Never miss twice.', detail: 'If you break a streak once, treat getting back on track the very next day as the actual rule.' },
          { text: 'Redesign your environment before your willpower.', detail: 'Change the physical layout of a space to make the desired behavior the path of least resistance.' },
          { text: 'Vote for the identity, not the outcome.', detail: 'After completing a habit, note the identity it reinforces, not just the task completed.' },
          { text: 'Use temptation bundling.', detail: 'Pair an action you need to do with one you want to do, so the habit reinforces itself.' }
        ]
      },
      {
        key: 'deep-work', title: 'Deep Work', author: 'Cal Newport', year: '2016',
        focus: 'Productivity / Focused Attention',
        blurb: 'Argues the ability to focus without distraction on cognitively demanding tasks is increasingly rare and valuable, and most knowledge workers default to shallow, reactive work because it\'s easier. Deep work produces disproportionate results compared to the same hours spent fragmented.',
        directives: [
          { text: 'Schedule fixed deep work blocks in advance.', detail: 'Block specific hours each week for uninterrupted focused work, as unmovable as a client meeting.' },
          { text: 'Quantify the true cost of a shallow task.', detail: 'Before agreeing to a meeting, estimate how much deep work time it will fragment, not just its own duration.' },
          { text: 'Batch shallow work into a fixed window.', detail: 'Designate one block for email and admin, and decline to touch it outside that window.' },
          { text: 'Set a hard shutdown ritual.', detail: "End your workday with a specific signal that shutdown is complete, so tasks don't bleed into your evening." },
          { text: 'Practice productive meditation.', detail: 'During a walk, deliberately hold and work through one professional problem instead of consuming media.' },
          { text: 'Quit or drastically reduce low-value social media.', detail: "Apply a 30-day test: if a platform's absence causes no real loss, remove it permanently." },
          { text: 'Measure your day in deep work hours.', detail: 'Log distraction-free focused hours, not total hours at your desk, as your real productivity metric.' }
        ]
      },
      {
        key: 'seven-habits', title: 'The 7 Habits of Highly Effective People', author: 'Stephen R. Covey', year: '1989',
        focus: 'Productivity / Character-Based Effectiveness',
        blurb: 'Argues lasting effectiveness comes from character and principles, not personality tactics, moving a person from dependence through independence to interdependence. Distinguishes urgent from important, arguing effective people organize their lives around the latter.',
        directives: [
          { text: 'Write a personal mission statement.', detail: 'Draft your core values and the person you want to be, and use it as the filter for major decisions.' },
          { text: 'Sort your week by the time-management quadrant.', detail: 'Categorize planned tasks by urgent/important, and schedule "important, not urgent" work before it becomes a crisis.' },
          { text: 'Begin any collaboration by understanding first.', detail: "Restate the other person's position accurately before presenting your own." },
          { text: 'Negotiate for win-win, or walk away.', detail: 'Explicitly look for a third option that serves both parties before accepting a lose-win.' },
          { text: 'Sharpen one of the four dimensions weekly.', detail: 'Schedule renewal time for physical, mental, social, or spiritual dimensions, rotating through all four.' },
          { text: 'Start with the end in mind.', detail: 'Before major work, write a one-paragraph description of what success looks like at completion.' },
          { text: 'Put first things first, literally on the calendar.', detail: 'Schedule your highest-priority, non-urgent tasks before smaller requests fill the space.' },
          { text: 'Seek synergy instead of compromise.', detail: 'In group decisions, ask for a third option neither side has proposed before settling for 50/50.' }
        ]
      },
      {
        key: 'essentialism', title: 'Essentialism', author: 'Greg McKeown', year: '2014',
        focus: 'Productivity / Prioritization',
        blurb: 'Argues the pursuit of "more" leaves most people busy but unfulfilled, and the essentialist deliberately trades the trivial many for the vital few. If you don\'t prioritize your own life, someone else will do it for you.',
        directives: [
          { text: 'Apply the 90% rule to new commitments.', detail: "Rate an opportunity 0–100; if it's not a 90 or above, treat it as a no." },
          { text: 'Replace "I have to" with "I choose to."', detail: "Reframe a recurring obligation as a choice, surfacing whether you'd choose it again if optional." },
          { text: 'Protect an "essential intent" for each quarter.', detail: 'Write one concrete, measurable priority for the next three months and filter requests against it.' },
          { text: 'Say no with a graceful, clear script.', detail: 'Prepare a short, non-apologetic phrase in advance for declining requests.' },
          { text: 'Build in a buffer for the unexpected.', detail: 'Add 50% more time than feels necessary to important project estimates.' },
          { text: 'Do a quarterly commitment audit.', detail: 'Every three months, cut at least one recurring commitment that no longer serves your essential intent.' },
          { text: 'Design small wins before big pushes.', detail: 'Identify the smallest concrete first step you can complete this week, to build momentum.' }
        ]
      }
    ]
  },
  {
    key: 'psychology-behaviour', numeral: 'VI', title: 'Psychology & Human Behaviour',
    blurb: "Your mind runs on automatic settings you didn't choose. This section is about seeing those settings clearly enough to override them.",
    books: [
      {
        key: 'thinking-fast-and-slow', title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', year: '2011',
        focus: 'Psychology / Cognitive Bias & Decision-Making',
        blurb: "Divides the mind into two systems — fast, intuitive System 1 and slow, deliberate System 2 — and argues most errors in judgment come from letting System 1 decide things that actually need System 2's scrutiny. Catalogs the specific biases that quietly distort everyday decisions.",
        directives: [
          { text: 'Slow down for high-stakes decisions.', detail: 'Before a major purchase, hire, or investment, write the reasoning out in full sentences rather than trusting a fast gut call.' },
          { text: 'Name the anchor before you negotiate.', detail: 'Identify the first number mentioned in a negotiation and consciously discount its pull on your own counter-offer.' },
          { text: 'Distrust vivid, recent examples.', detail: 'When a dramatic recent event makes a risk feel more likely, check the actual base rate before adjusting your behavior.' },
          { text: 'Pre-commit to a loss before it happens.', detail: "Decide your exit criteria for an investment or project before you start, since loss aversion makes quitting hard once you're in." },
          { text: 'Get a second, independent estimate.', detail: 'Before finalizing a time or cost estimate, have someone unfamiliar with the plan estimate it separately.' },
          { text: 'Separate the decision from the outcome.', detail: 'After a bad result, write down whether the process was sound at the time, since outcome and decision quality are easily confused.' },
          { text: 'Build a checklist for recurring decisions.', detail: "For any decision you make often, write the criteria in advance so first impressions can't quietly override your own standards." }
        ]
      },
      {
        key: 'influence', title: 'Influence', author: 'Robert Cialdini', year: '1984',
        focus: 'Psychology / Persuasion & Social Influence',
        blurb: 'Identifies six principles — reciprocity, commitment/consistency, social proof, authority, liking, and scarcity — that reliably move human behavior, often below conscious awareness. Knowing them lets you use them ethically and recognize when they\'re being used on you.',
        directives: [
          { text: 'Give first, without keeping score.', detail: 'In a new professional relationship, offer something useful before asking for anything back.' },
          { text: 'Get small commitments in writing early.', detail: 'Before a big ask, secure a small, specific agreement first — people work hard to stay consistent with it.' },
          { text: 'Check social proof claims before trusting them.', detail: 'When "everyone\'s doing it" is doing the persuading, verify the actual number or source.' },
          { text: 'Question unearned authority signals.', detail: 'Notice when a title or credential is doing the persuading rather than the argument, and evaluate the argument on its own.' },
          { text: 'Slow down around real scarcity claims.', detail: 'When told an offer is "limited time," build in a mandatory 24-hour delay before deciding.' },
          { text: "Audit who you're inclined to say yes to.", detail: 'Notice if you\'re agreeing because you like the person asking, separate from whether the request is reasonable.' },
          { text: 'State your own criteria in advance.', detail: "Write your decision criteria before you're in the room with a persuasive counterpart, so pressure has less to work with." }
        ]
      },
      {
        key: 'mindset', title: 'Mindset', author: 'Carol Dweck', year: '2006',
        focus: 'Psychology / Growth vs. Fixed Mindset',
        blurb: 'Research shows people who believe ability is fixed avoid challenges to protect their self-image, while people who believe ability develops treat effort and failure as the actual mechanism of growth. The belief about your capability shapes how far you go more than the capability itself.',
        directives: [
          { text: 'Add "yet" to your self-assessment.', detail: 'The next time you say "I\'m not good at this," add "yet" out loud, and let it change your next action.' },
          { text: 'Praise the process, not the trait.', detail: 'When acknowledging a success, name the specific effort or strategy used, not an innate quality like "smart."' },
          { text: 'Treat a plateau as a signal to change method, not identity.', detail: "When progress stalls, ask what specific approach needs to change instead of concluding you've hit your ceiling." },
          { text: 'Seek out feedback that stings a little.', detail: "Deliberately ask for the critical feedback you've been avoiding, and treat discomfort as a sign it's useful." },
          { text: 'Track effort and strategy, not just results.', detail: 'Log what you tried and adjusted, not just whether you succeeded, so setbacks read as data.' },
          { text: "Reframe a rival's success as information.", detail: "When someone else succeeds where you didn't, extract one specific thing they did differently." }
        ]
      },
      {
        key: 'emotional-intelligence', title: 'Emotional Intelligence', author: 'Daniel Goleman', year: '1995',
        focus: 'Psychology / Emotional Self-Regulation & Social Awareness',
        blurb: 'Argues self-awareness, self-regulation, motivation, empathy, and social skill predict success as much as raw IQ — and unlike IQ, they can be deliberately trained. Reframes "soft skills" as a learnable discipline, not a fixed trait.',
        directives: [
          { text: 'Name the emotion before you act on it.', detail: 'In a moment of frustration, silently label the specific emotion rather than just reacting to it.' },
          { text: 'Build a pause before your default reaction.', detail: 'Practice a fixed physical cue — a breath, a count to five — between a trigger and your response.' },
          { text: 'Track your emotional triggers in writing.', detail: 'Keep a short log of situations that reliably spike your stress or anger, to recognize the pattern before it recurs.' },
          { text: 'Practice reading a room before speaking.', detail: 'In your next meeting, spend the first few minutes observing tone and body language before contributing.' },
          { text: 'Check in on your motivation source.', detail: "Before a demanding task, identify whether you're driven by an internal standard or external approval." },
          { text: 'Ask what someone is feeling, not just what happened.', detail: 'In a difficult conversation, explicitly ask how the other person feels, not only for the facts.' },
          { text: 'Self-assess after emotionally charged moments.', detail: 'After a heated interaction, write down what you felt and how you handled it, rating your regulation honestly.' }
        ]
      }
    ]
  }
];

/** Flat list of every directive with its stable key and parent book/pillar context — the shape views actually iterate over. */
export function allDirectives() {
  const out = [];
  for (const pillar of PILLARS) {
    for (const book of pillar.books) {
      book.directives.forEach((d, i) => {
        out.push({
          key: `${book.key}-${String(i + 1).padStart(2, '0')}`,
          text: d.text, detail: d.detail,
          bookKey: book.key, bookTitle: book.title, bookAuthor: book.author,
          pillarKey: pillar.key, pillarTitle: pillar.title
        });
      });
    }
  }
  return out;
}
