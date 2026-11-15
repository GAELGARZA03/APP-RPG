// Todas las lecturas y escrituras del juego. Cada área vive en src/data/store/;
// el resto de la app importa desde aquí.
export { MAX_NOTES_PER_TASK, MAX_NOTE_LENGTH, MAX_PHOTOS_PER_TASK } from './store/shared'
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
export { completeDaily, getDaily, getDailyContext, saveDaily, undoDaily } from './store/daily'
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
  saveDailyNote,
} from './store/notes'
export { clampSleep, getSleep, getSleepRange, MAX_SLEEP_HOURS, setSleep, SLEEP_GOAL_HOURS } from './store/sleep'
export type { SleepRange } from './store/sleep'
export { getMilestones } from './store/milestones'
export type { Milestone, MilestoneKind } from './store/milestones'
