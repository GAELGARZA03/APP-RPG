// Todas las lecturas y escrituras del juego. Cada área vive en src/data/store/;
// el resto de la app importa desde aquí.
export {
  MAX_DIARY_PHOTOS,
  MAX_NOTES_PER_TASK,
  MAX_NOTE_LENGTH,
  MAX_PHOTOS_PER_TASK,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  MAX_VIDEOS,
} from './store/shared'
export { getMediaUsage, getVideoBlob } from './store/media'
export { formatClock, getHabitStats, habitAnalysisInput, MIN_TIME_SAMPLES, WEEKDAY_NAMES } from './store/habitStats'
export type { HabitInsight, HabitStats } from './store/habitStats'
export type { ActCompletion, Outcome, TaskChanges, TaskInput, TaskRef } from './store/shared'
export { getHud, getWeek } from './store/hud'
export type { Hud, WeekDay, WeekDayStatus } from './store/hud'
export {
  archiveHabit,
  completeHabit,
  createHabit,
  dayAccess,
  getArchivedHabits,
  getHabitGrid,
  getHabits,
  getReminderPlan,
  getNotebook,
  getTodayHabits,
  habitStreak,
  moveHabit,
  nextHabitState,
  restoreHabit,
  setHabitState,
  undoHabit,
  updateHabit,
} from './store/habits'
export type {
  DayAccess,
  HabitGrid,
  HabitInput,
  Notebook,
  NotebookCell,
  NotebookHabit,
  ReminderPlan,
  TodayHabit,
} from './store/habits'
export {
  acceptCampaignPlan,
  acceptPlan,
  addActMissions,
  createCampaign,
  deleteCampaign,
  getActReport,
  getAiContext,
  getCampaign,
  getCampaignProgress,
  getMissions,
  renameCampaign,
  resetProgress,
} from './store/campaigns'
export type {
  ActReport,
  ActView,
  AiContext,
  CampaignPlanInput,
  CampaignView,
  MissionInput,
  QuestView,
} from './store/campaigns'
export { getTaskDetail } from './store/detail'
export type { TaskDetailView } from './store/detail'
export { getSkillDetail, getSkillTree } from './store/skills'
export type { SkillDetail, SkillNode, SkillTree } from './store/skills'
export {
  completeQuest,
  completeSideQuest,
  createSideQuest,
  deleteSideQuest,
  skipSideQuest,
  undoSideQuest,
  updateSideQuest,
} from './store/quests'
export { toggleStep } from './store/steps'
export { addEvidence, deleteEvidence, getJournal } from './store/journal'
export type { JournalEntry } from './store/journal'
export {
  completeDaily,
  DAILIES_PER_DAY,
  getDailies,
  getDailyContext,
  saveDailies,
  saveDaily,
  undoDaily,
} from './store/daily'
export type { DailyContext, DailyView } from './store/daily'
export {
  applyAdjustment,
  dismissAdjustment,
  dismissEmptyWeek,
  getReview,
  getReviewCard,
  getWeekReport,
  listReviews,
  planToReview,
  saveReview,
  STUCK_AFTER_DAYS,
  weekStartOf,
} from './store/review'
export type { ApplyResult, ReviewCardView, ReviewPlan, ReviewRef, WeekReport } from './store/review'
export {
  getDailyNote,
  getDiaryMonth,
  getDiaryRange,
  getMemory,
  listDailyNotes,
  MAX_DAILY_NOTE_LENGTH,
  addDiaryMedia,
  noteCover,
  removeDiaryPhoto,
  removeDiaryVideo,
  saveDailyNote,
} from './store/notes'
export type { NewMedia } from './store/media'
export { clampSleep, getSleep, getSleepRange, MAX_SLEEP_HOURS, setSleep, SLEEP_GOAL_HOURS } from './store/sleep'
export type { SleepRange } from './store/sleep'
export { getMilestones } from './store/milestones'
export type { Milestone, MilestoneKind } from './store/milestones'
export {
  archiveReward,
  checkGoalRewards,
  createReward,
  getCampaignStreaks,
  getShop,
  getWallet,
  MAX_REWARD_PRICE,
  redeemReward,
  updateReward,
} from './store/shop'
export type { RedeemResult, RewardInput, Shop, Wallet } from './store/shop'
export {
  acceptRouteOffer,
  activateNextRouteItem,
  consistency,
  deleteRoute,
  getRoute,
  offerFor,
  ROUTE_HIGH,
  ROUTE_LOW,
  ROUTE_MIN_DAYS,
  ROUTE_WINDOW_DAYS,
  snoozeRouteOffer,
  startRoute,
} from './store/route'
export type { RouteOffer, RoutePlanItem, RouteStep } from './store/route'
