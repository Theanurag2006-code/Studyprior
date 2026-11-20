// DEMO DATA ONLY. Replaced via the service layer in Milestone 02.
import type { AppNotification, Contributor, Conversation, PlanItem, Rating, Report, Senior, Subject, Topic, Unit, User } from '../types';

export const BRANCHES = ['Computer Science', 'Electronics', 'Mechanical'];
export const DEPARTMENTS = ['Engineering & Technology', 'Management Studies', 'Applied Sciences', 'Architecture & Design'];
export const subjects: Subject[] = [
  { id: 's1', name: 'Data Structures', code: 'CS201', branch: 'Computer Science', semester: 3 },
  { id: 's2', name: 'Database Management', code: 'CS202', branch: 'Computer Science', semester: 3 },
  { id: 's3', name: 'Discrete Mathematics', code: 'MA201', branch: 'Computer Science', semester: 3 },
  { id: 's4', name: 'Operating Systems', code: 'CS301', branch: 'Computer Science', semester: 5 },
  { id: 's5', name: 'Computer Networks', code: 'CS302', branch: 'Computer Science', semester: 5 },
];
export const units: Unit[] = [
  { id: 'u1', subjectId: 's1', name: 'Linear Structures' }, { id: 'u2', subjectId: 's1', name: 'Trees & Graphs' },
  { id: 'u3', subjectId: 's2', name: 'Relational Model & SQL' }, { id: 'u4', subjectId: 's2', name: 'Transactions' },
  { id: 'u5', subjectId: 's3', name: 'Logic & Proofs' }, { id: 'u6', subjectId: 's4', name: 'Processes & Scheduling' },
  { id: 'u7', subjectId: 's5', name: 'Network Layers' },
];
const t = (id: string, unitId: string, subjectId: string, name: string): Topic => ({ id, unitId, subjectId, name });
export const topics: Topic[] = [
  t('t1', 'u1', 's1', 'Arrays & Linked Lists'), t('t2', 'u1', 's1', 'Stacks & Queues'), t('t3', 'u2', 's1', 'Binary Trees'),
  t('t4', 'u2', 's1', 'Graph Traversal'), t('t5', 'u3', 's2', 'SQL Joins'), t('t6', 'u3', 's2', 'Normalization'),
  t('t7', 'u4', 's2', 'ACID & Isolation Levels'), t('t8', 'u5', 's3', 'Propositional Logic'),
  t('t9', 'u6', 's4', 'CPU Scheduling'), t('t10', 'u7', 's5', 'TCP/IP Stack'),
];
const clamp = (n: number) => Math.max(1, Math.min(5, n));
// [topicId, count, importance, difficulty, exam, interview]; t8 intentionally has no ratings
const seeds: [string, number, number, number, number, number][] = [
  ['t1', 6, 5, 3, 5, 4], ['t2', 4, 4, 2, 4, 4], ['t3', 7, 5, 4, 5, 5], ['t4', 5, 5, 4, 4, 5], ['t5', 8, 5, 2, 5, 5],
  ['t6', 3, 4, 3, 5, 3], ['t7', 2, 4, 4, 4, 3], ['t9', 4, 3, 3, 4, 2], ['t10', 1, 3, 3, 3, 4],
];
// SAMPLE FIXTURES (demo mode only): fictional contributors with varied ratings, some without written advice.
export const contributors: Contributor[] = [
  { id: 'u1', name: 'Aarav M.', level: 'Senior', branch: 'Computer Science', public: true }, { id: 'u2', name: 'Diya S.', level: 'Senior', branch: 'Computer Science', public: true },
  { id: 'u3', name: 'Kabir V.', level: 'Junior', branch: 'Computer Science', public: true }, { id: 'u4', name: 'Isha R.', level: 'Senior', branch: 'Electronics', public: true },
  { id: 'u5', name: 'Hidden', level: 'Junior', branch: 'Computer Science', public: false }, { id: 'u6', name: 'Meera P.', level: 'Junior', branch: 'Computer Science', public: true },
  { id: 'u7', name: 'Rohan T.', level: 'Senior', branch: 'Computer Science', public: true }, { id: 'u8', name: 'Hidden', level: 'Senior', branch: 'Mechanical', public: false },
  { id: 'u9', name: 'Neha K.', level: 'Junior', branch: 'Electronics', public: true },
];
const ADVICE = ['Practice previous-year questions first, then revise the theory.', 'Draw the diagram by hand before coding it; it makes the logic clear.', 'This shows up in almost every viva, so be ready to explain it simply.',
  'Start with small examples and trace them step by step.', 'Focus on the recurring patterns instead of memorising every variation.', 'Interviewers love asking for the time complexity of this one.', 'Do not skip the basics; later units build directly on this.', 'Solve at least ten problems before the exam.'];
const MISTAKES = ['Mixing up the base case and the recursive step.', 'Forgetting edge cases such as empty input.', 'Memorising definitions without working through examples.'];
const NUDGE = [0, 1, -1, 0, 1, -1, 0, 0, -1];
export const ratings: Rating[] = seeds.flatMap(([topicId, n, i, d, e, v], ti) =>
  Array.from({ length: n }, (_, k) => ({
    id: `${topicId}-r${k}`, topicId, userId: `u${(k % 9) + 1}`, importance: clamp(i + NUDGE[(k + ti) % 9]), difficulty: clamp(d + NUDGE[(k + 2 * ti + 1) % 9]),
    exam: clamp(e + NUDGE[(k + 3) % 9]), interview: clamp(v + NUDGE[(k + ti + 4) % 9]), at: `2026-09-${String(((k * 3 + ti) % 27) + 1).padStart(2, '0')}`,
    level: contributors[k % 9].level, advice: k % 3 === 2 ? '' : ADVICE[(k + ti) % ADVICE.length], mistakes: k % 4 === 1 ? MISTAKES[(k + ti) % MISTAKES.length] : '',
  })));
export const seniors: Senior[] = [
  { id: 'sr1', name: 'Aarav Mehta', accountType: 'Senior', branch: 'Computer Science', year: 'Final Year', semester: 7, subjects: ['s1', 's2'], contributions: 24, bio: 'Sample profile. Happy to talk data structures and SQL.', available: true },
  { id: 'sr2', name: 'Diya Sharma', accountType: 'Candidate', branch: 'Computer Science', year: 'Final Year', semester: 8, subjects: ['s3', 's4'], contributions: 17, bio: 'Sample profile. Likes breaking proofs into small steps.', available: true },
  { id: 'sr3', name: 'Kabir Verma', accountType: 'Junior', branch: 'Computer Science', year: 'Third Year', semester: 6, subjects: ['s5', 's4'], contributions: 9, bio: 'Sample profile. Networks and OS, exam-focused.', available: false },
  { id: 'sr4', name: 'Isha Rao', accountType: 'Senior', branch: 'Electronics', year: 'Final Year', semester: 7, subjects: ['s3'], contributions: 6, bio: 'Sample profile. Maths-heavy advice for non-CS branches.', available: true },
];
const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
export const user: User = { name: 'Anuj', email: 'anuj@studyprior.com', joined: '2024-08-01', department: 'Engineering & Technology', enrollmentYear: 2024, graduationYear: 2028, college: 'MITS DU', branch: 'Computer Science', enrollment: 'DEMO-2024-0042', bio: 'Building a strong DSA base.', semester: 3, available: false, accountType: 'Junior', accountTypeSelected: true, streak: 0, savedSubjectIds: ['s1', 's2', 's3'] };
export const plans: PlanItem[] = [
  { id: 'p1', topicId: 't5', target: day(0), minutes: 45, status: 'In Progress' },
  { id: 'p2', topicId: 't3', target: day(3), minutes: 90, status: 'Planned' },
];
export const notifications: AppNotification[] = [
  { id: 'n1', text: 'Aarav Mehta added advice on Binary Trees', read: false, to: '/explore?q=Binary', at: '2h ago' },
  { id: 'n2', text: 'Study plan: SQL Joins is due today', read: false, to: '/planner', at: '5h ago' },
  { id: 'n3', text: 'Diya Sharma is now available for questions', read: true, to: '/seniors', at: '1d ago' },
];
export const conversations: Conversation[] = [
  { id: 'c1', seniorId: 'sr1', unread: 1, draft: '', messages: [{ id: 'm1', from: 'them', text: 'Sample thread: start with trees, graphs come easier after.', at: 'Yesterday 18:20' }] },
];
export const reports: Report[] = [
  { id: 'rp1', target: 'Contribution on Normalization', reason: 'Possibly inaccurate advice (sample)', status: 'Open' },
  { id: 'rp2', target: 'Rating on TCP/IP Stack', reason: 'Spam (sample)', status: 'Open' },
];
