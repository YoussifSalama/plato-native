// Delete one account and everything that belongs to it (the privacy policy's "delete my data"). mongosh script.
//   On the VPS:
//   P=$(grep ^MONGO_ROOT_PASSWORD /opt/plato/.env | cut -d= -f2)
//   docker cp /opt/plato/src/deploy/delete-user.js plato-mongo-1:/tmp/delete-user.js
//   docker exec -e EMAIL=someone@example.com plato-mongo-1 mongosh -u root -p "$P" --authenticationDatabase admin plato --quiet /tmp/delete-user.js
// Prints what it removes per collection. Resume files in object storage (R2) are not touched: delete them from the bucket.
const email = (typeof process !== 'undefined' && process.env && process.env.EMAIL) || '';
if (!email) throw new Error('set EMAIL=<address>');
const user = db.users.findOne({ email: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
if (!user) throw new Error(`no user with email ${email}`);
const seekers = db.job_seekers.find({ user_id: { $in: [user._id, user._id.toString()] } }).toArray();
const seekerIds = seekers.flatMap((s) => [s._id, s._id.toString()]);
const userIds = [user._id, user._id.toString()];
const bySeeker = ['career_threads', 'career_resumes', 'chat_threads', 'job_alerts', 'alert_matches', 'alert_settings', 'alert_digests', 'mock_interviews', 'discovery_runs', 'job_seeker_job_matches', 'job_applications', 'extension_devices', 'extension_pairings', 'apply_batches', 'apply_batch_items', 'job_seeker_projects', 'job_seeker_achievements', 'job_seeker_skill_evidence', 'job_seeker_resume_settings', 'skill_credentials', 'job_seeker_document_versions', 'job_seeker_social_links', 'job_seeker_documents', 'job_seeker_experiences', 'job_seeker_educations', 'job_seeker_certifications', 'job_seeker_languages', 'job_seeker_profile_evaluations', 'job_seeker_preferences'];
const byUser = ['auth_tokens', 'credit_accounts', 'credit_ledger', 'usage_events'];
print(`deleting ${user.email} (user ${user._id}, ${seekers.length} seeker profile(s))`);
if (seekerIds.length) for (const c of bySeeker) { const r = db.getCollection(c).deleteMany({ job_seeker_id: { $in: seekerIds } }); if (r.deletedCount) print(`  ${c}: ${r.deletedCount}`); }
for (const c of byUser) { const r = db.getCollection(c).deleteMany({ user_id: { $in: userIds } }); if (r.deletedCount) print(`  ${c}: ${r.deletedCount}`); }
const s = db.job_seekers.deleteMany({ _id: { $in: seekers.map((x) => x._id) } });
const u = db.users.deleteOne({ _id: user._id });
print(`  job_seekers: ${s.deletedCount}\n  users: ${u.deletedCount}\ndone: ${user.email} and phone ${user.phone ?? '-'} are free again`);
