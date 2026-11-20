export type Level = 'Must Study' | 'High Priority' | 'Medium' | 'Low';
export type Confidence = 'Limited data' | 'Early signal' | 'Broader community signal';
export type PlanStatus = 'Planned' | 'In Progress' | 'Completed';
export type AccountCategory = 'Junior' | 'Senior' | 'Candidate';
export type StudentLevel = AccountCategory;
export type SubjectStatus = 'PUBLISHED' | 'PENDING_REVIEW';
export interface PublicAuthor { id: string; name: string; level?: StudentLevel }
export interface Subject { id: string; name: string; code: string; branch: string; semester: number; status?: SubjectStatus; ownerId?: string; community?: boolean; description?: string; author?: PublicAuthor }
export interface Unit { id: string; subjectId: string; name: string }
export interface Topic { id: string; unitId: string; subjectId: string; name: string; description?: string; hours?: number; author?: PublicAuthor }
export type TopicRelationshipType = 'PREREQUISITE' | 'RELATED';
export interface TopicRelationship { id: string; subjectId: string; sourceTopicId: string; targetTopicId: string; type: TopicRelationshipType; createdAt: string; isMine?: boolean }
export interface Rating { id: string; topicId: string; userId: string; importance: number; difficulty: number; exam: number; interview: number; advice: string; mistakes: string; at: string; level: StudentLevel; accountType?: AccountCategory }
/** Public-facing contributor fields only. No email or private data. `public: false` hides name, level and branch. */
export interface Contributor { id: string; name: string; level: StudentLevel; branch: string; public: boolean }
/** Fields an ordinary student may change about themselves. System role, semester, email and password are server-controlled; account category is independently selected at signup (or confirmed once on legacy accounts). */
export type ProfilePatch = Partial<Pick<User, 'name' | 'department' | 'branch' | 'college' | 'enrollmentYear' | 'graduationYear' | 'bio' | 'available' | 'publicProfile' | 'accountType'>>;
export interface Senior { id: string; name: string; accountType: AccountCategory; branch: string; year: string; semester: number; subjects: string[]; contributions: number; bio: string; available: boolean }
export interface SeniorContributionStats { subjectsSubmitted: number; subjectsPublished: number; subjectsPending: number; topicsSubmitted: number; topicsPublished: number; ratingsSubmitted: number; writtenExplanations: number; helpfulVotesReceived: number; totalPublishedContributions: number }
export interface SeniorProfileData {
  profile: { id: string; name: string; accountType: AccountCategory; branch: string; department: string; college: string; semester: number; year: string; graduationYear: number; bio: string; available: boolean; publicProfile: boolean; joined: string; isOwnProfile: boolean; subjects: { id: string; name: string }[] };
  stats: SeniorContributionStats;
}
export interface SeniorFeedItem { id: string; type: 'subject' | 'topic' | 'rating'; title: string; body: string; subtitle: string; subjectId: string; topicId?: string; subjectName?: string; createdAt: string; helpfulCount: number; isHelpful: boolean; advice?: string; mistakes?: string; ratings?: { importance: number; difficulty: number; exam: number; interview: number } }
export interface SeniorFeedPage { items: SeniorFeedItem[]; total: number; offset: number; limit: number; hasMore: boolean }
export type ContributionType = 'subject' | 'topic' | 'rating'
export type PurposeCode = 'EXAMS' | 'HIGHER_STUDIES' | 'CONCEPTUAL' | 'INTERVIEW' | 'REVISION' | 'PROJECTS' | 'PERSONAL' | 'OTHER';
export interface PlanItem { id: string; topicId: string; target: string; minutes: number; status: PlanStatus; purpose?: PurposeCode; customPurpose?: string }
/** Private to the current user. Never published as advice or ratings. */
export interface Note { id: string; title: string; body: string; subjectId?: string; topicId?: string; planId?: string; createdAt: string; updatedAt: string }
export interface DraftTopic { name: string; unit: string; description: string; hours: string }
export interface SubjectDraft { id: string; name: string; branch: string; semester: number; description: string; topics: DraftTopic[]; updatedAt: string }
export interface NewSubjectInput { name: string; branch: string; semester: number; description: string; topics: { name: string; unit: string; description: string; hours?: number }[] }
export interface NewTopicInput { subjectId: string; name: string; unit: string; description: string; hours?: number }
export interface RatingInput { topicId: string; importance: number; difficulty: number; exam: number; interview: number; advice: string; mistakes: string; level?: StudentLevel; accountType?: AccountCategory }
export type MessageDeliveryStatus = 'SENT' | 'DELIVERED' | 'SEEN' | 'PARTIAL_DELIVERED' | 'PARTIAL_SEEN';
export interface Message { id: string; from: 'me' | 'them'; text: string; at: string; deliveryStatus?: MessageDeliveryStatus }
export interface Conversation { id: string; seniorId: string; messages: Message[]; unread: number; draft: string; peer?: { id: string; name: string; level: string; branch: string }; blocked?: boolean }
export interface AskGroup { id: string; question: string; createdAt: string; lastAt: string; asker: { id: string; name: string }; memberType: 'ASKER' | 'HELPER'; memberCount: number; unread: number }
export interface AskGroupMessage { id: string; senderId: string; senderName: string; mine: boolean; text: string; at: string; deliveryStatus?: MessageDeliveryStatus; recipientCount?: number; deliveredCount?: number; seenCount?: number }
export interface AskGroupDetail { id: string; question: string; createdAt: string; lastAt: string; asker: { id: string; name: string }; members: { id: string; name: string; accountType: AccountCategory; semester: number; memberType: 'ASKER' | 'HELPER' }[]; messages: AskGroupMessage[]; memberType: 'ASKER' | 'HELPER' }
export interface AppNotification { id: string; text: string; read: boolean; to: string; at: string }
export interface Report { id: string; target: string; reason: string; status: 'Open' | 'Resolved' }
export interface User { name: string; email: string; joined: string; department: string; enrollmentYear: number; graduationYear: number; college: string; branch: string; enrollment: string; bio: string; semester: number; available: boolean; streak: number; savedSubjectIds: string[]; role?: 'STUDENT' | 'ADMIN'; level?: string | null; accountType?: AccountCategory; accountTypeSelected?: boolean; theme?: 'light' | 'dark'; publicProfile?: boolean }
export interface Summary { n: number; importance: number; difficulty: number; exam: number; interview: number; score: number; level: Level; confidence: Confidence }
export interface ApiRatingSummary { sampleCount: number; priorityScore: number | null; priorityLabel: Level | null; confidence: { label: string; sampleCount: number }; means: { importance: number; difficulty: number; exam: number; interview: number } | null; message: string | null }
export interface ApiTopicSummary { overall: ApiRatingSummary; senior: ApiRatingSummary; junior: ApiRatingSummary; candidate: ApiRatingSummary }
