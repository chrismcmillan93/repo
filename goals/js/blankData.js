// Empty dataset for the live app while it has no real backend connection
// yet (schema not exposed, auth not configured — see §8 of the build
// spec). Produces the app's genuine empty states rather than error banners,
// with none of demo/'s sample content. Same shape buildDemoData() returns.

export function buildDemoData() {
  return {
    life_areas: [],
    goals: [],
    milestones: [],
    goal_updates: [],
    goal_progress: [],
    reviews: [],
    review_goals: [],
    __pending: []
  };
}
