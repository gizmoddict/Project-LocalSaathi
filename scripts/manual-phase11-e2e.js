/**
 * LOCALSAATHI — PHASE 11 E2E VERIFICATION SCRIPT
 *
 * 24-Step End-to-End Verification of Real-Time Messaging & Conversation Subsystem:
 *  1. Worker login (authenticate & obtain JWT)
 *  2. Employer login (authenticate & obtain JWT)
 *  3. Employer creates and publishes a JobPost
 *  4. Worker applies to the job
 *  5. Employer shortlists the worker application
 *  6. Employer initiates a conversation with the worker
 *  7. Worker connects to Socket.IO namespace /messages
 *  8. Employer connects to Socket.IO namespace /messages
 *  9. Worker joins conversation room
 * 10. Employer joins conversation room
 * 11. Worker sends message via REST API
 * 12. Employer receives message via WebSocket in real time
 * 13. Employer marks conversation read via REST API
 * 14. Worker receives read receipt via WebSocket in real time
 * 15. Worker dispatches typing indicator via WebSocket
 * 16. Employer receives typing indicator via WebSocket
 * 17. Worker disconnects (offline state)
 * 18. Employer sends message while worker is offline
 * 19. Worker reconnects to WebSocket namespace /messages
 * 20. Worker queries REST API and retrieves the missed message
 * 21. Duplicate message send retry (same clientMessageId) -> verified idempotent
 * 22. Unauthorized user attempts to read conversation/messages -> rejected (403/404 IDOR)
 * 23. Worker blocks employer -> subsequent send attempt rejected (403 Forbidden)
 * 24. Worker unblocks employer & reports message -> report persisted in database
 */

const http = require('http');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const { io } = require('socket.io-client');

const prisma = new PrismaClient();

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
const AUTH_PEPPER =
  process.env.AUTH_PEPPER ||
  'localsaathi_development_auth_pepper_secret_minimum_32_characters';
const JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ||
  'localsaathi_dev_jwt_access_secret_min_32_chars!';

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        let json;
        try {
          json = JSON.parse(buf);
        } catch {
          json = buf;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    if (body) {
      const data = typeof body === 'string' ? body : JSON.stringify(body);
      req.write(data);
    }
    req.end();
  });
}

function hashOtp(phone, otp) {
  return crypto
    .createHmac('sha256', AUTH_PEPPER)
    .update(`${phone}:${otp}`)
    .digest('hex');
}

function normalizePhone(p) {
  const digits = p.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

async function findOtpForPhone(rawPhone) {
  const phone = normalizePhone(rawPhone);
  const challenge = await prisma.otpChallenge.findFirst({
    where: { phone, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!challenge) throw new Error(`No active OTP challenge in DB for ${phone}`);
  for (let i = 0; i <= 999999; i++) {
    const candidate = i.toString().padStart(6, '0');
    if (hashOtp(phone, candidate) === challenge.otpHash) return candidate;
  }
  throw new Error(`Could not recover OTP for ${phone}`);
}

async function authenticateUser(phone, role) {
  await request(
    {
      hostname: 'localhost',
      port: PORT,
      path: '/api/v1/auth/otp/request',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { phone, role }
  );
  const otp = await findOtpForPhone(phone);
  const verifyRes = await request(
    {
      hostname: 'localhost',
      port: PORT,
      path: '/api/v1/auth/otp/verify',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { phone, otp, role }
  );
  if (verifyRes.status !== 200 || !verifyRes.body?.data?.accessToken) {
    throw new Error(`Auth failed for ${phone} (${role}): ${JSON.stringify(verifyRes.body)}`);
  }
  return {
    token: verifyRes.body.data.accessToken,
    userId: verifyRes.body.data.user.id,
  };
}

function api(token) {
  return (method, urlPath, body) =>
    request(
      {
        hostname: 'localhost',
        port: PORT,
        path: `/api/v1${urlPath}`,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      body
    );
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

function getPayload(res) {
  return res && res.body && res.body.data !== undefined ? res.body.data : res.body;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runE2E() {
  console.log('\n=============================================================');
  console.log(' LOCALSAATHI — PHASE 11 REAL-TIME MESSAGING E2E VERIFICATION');
  console.log('=============================================================\n');

  const ts = Date.now().toString().slice(-6);
  const workerPhone = `9811${ts}`;
  const employerPhone = `9911${ts}`;
  const intruderPhone = `9711${ts}`;

  let worker, employer, intruder;
  let workerSocket, employerSocket;

  try {
    // -------------------------------------------------------------------------
    // STEP 1: Worker Login
    // -------------------------------------------------------------------------
    console.log('[STEP 1] Authenticating Worker...');
    worker = await authenticateUser(workerPhone, 'WORKER');
    assert(!!worker.token && !!worker.userId, `Worker authenticated (${worker.userId})`);

    // Ensure worker profile exists
    let workerProfile = await prisma.workerProfile.findUnique({ where: { userId: worker.userId } });
    if (!workerProfile) {
      workerProfile = await prisma.workerProfile.create({
        data: {
          userId: worker.userId,
          displayName: 'Ramesh Electrician',
          onboardingStatus: 'COMPLETED',
          experienceYears: 2,
          expectedWage: 500,
          wageType: 'DAILY',
        },
      });
    }

    // -------------------------------------------------------------------------
    // STEP 2: Employer Login
    // -------------------------------------------------------------------------
    console.log('\n[STEP 2] Authenticating Employer...');
    employer = await authenticateUser(employerPhone, 'EMPLOYER');
    assert(!!employer.token && !!employer.userId, `Employer authenticated (${employer.userId})`);

    let employerProfile = await prisma.employerProfile.findUnique({ where: { userId: employer.userId } });
    if (!employerProfile) {
      employerProfile = await prisma.employerProfile.create({
        data: {
          userId: employer.userId,
          businessName: 'Saathi Buildcon',
          verificationState: 'VERIFIED',
        },
      });
    }

    const workerApi = api(worker.token);
    const employerApi = api(employer.token);

    // -------------------------------------------------------------------------
    // STEP 3: Create & Publish Job Post
    // -------------------------------------------------------------------------
    console.log('\n[STEP 3] Creating and Publishing Job Post...');
    const jobRes = await employerApi('POST', '/employers/me/jobs', {
      title: `Senior Electrician ${ts}`,
      description: 'Urgent need for electrical installation at commercial project',
      category: 'ELECTRICAL',
      wageAmount: 750,
      wageType: 'DAILY',
      durationDays: 1,
      startDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      location: {
        addressLine: 'Gomti Nagar Extension',
        locality: 'Gomti Nagar',
        city: 'Lucknow',
        state: 'Uttar Pradesh',
        pinCode: '226010',
        latitude: 26.8467,
        longitude: 80.9462,
      },
      skills: [
        {
          name: 'Electrical',
          isRequired: true,
          minExperienceYears: 1,
        },
      ],
    });
    const job = getPayload(jobRes);
    assert(jobRes.status === 201 && job.id, `Job created with id: ${job.id}`);

    const publishRes = await employerApi('POST', `/employers/me/jobs/${job.id}/publish`);
    assert(publishRes.status === 200, `Job ${job.id} published`);

    // -------------------------------------------------------------------------
    // STEP 4: Worker Applies to Job
    // -------------------------------------------------------------------------
    console.log('\n[STEP 4] Worker Applies to Job...');
    const applyRes = await workerApi('POST', `/workers/me/jobs/${job.id}/applications`, {
      message: 'I have 5 years experience in commercial electrical installations.',
    });
    const application = getPayload(applyRes);
    assert(applyRes.status === 201 && application.id, `Application submitted with id: ${application.id}`);

    // -------------------------------------------------------------------------
    // STEP 5: Employer Shortlists Worker
    // -------------------------------------------------------------------------
    console.log('\n[STEP 5] Employer Shortlists Application...');
    const shortlistRes = await employerApi('POST', `/employers/me/applications/${application.id}/shortlist`);
    assert(shortlistRes.status === 200, `Application shortlisted`);

    // -------------------------------------------------------------------------
    // STEP 6: Employer Initiates Conversation with Worker
    // -------------------------------------------------------------------------
    console.log('\n[STEP 6] Employer Initiates Conversation...');
    const createConvRes = await employerApi('POST', '/conversations', {
      recipientUserId: worker.userId,
      type: 'JOB_RELATED',
      jobPostId: job.id,
      applicationId: application.id,
    });
    const conversation = getPayload(createConvRes);
    assert(
      (createConvRes.status === 200 || createConvRes.status === 201) && conversation.id,
      `Conversation established (ID: ${conversation.id})`
    );

    // -------------------------------------------------------------------------
    // STEP 7: Worker Connects to Socket.IO Namespace /messages
    // -------------------------------------------------------------------------
    console.log('\n[STEP 7] Worker Connecting to Socket.IO /messages...');
    const socketUrl = `http://localhost:${PORT}/messages`;
    workerSocket = io(socketUrl, {
      auth: { token: worker.token },
      transports: ['websocket'],
      forceNew: true,
    });

    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Worker socket connection timeout')), 5000);
      workerSocket.on('connect', () => {
        clearTimeout(t);
        assert(workerSocket.connected, `Worker connected to Socket.IO (socketId: ${workerSocket.id})`);
        resolve();
      });
      workerSocket.on('connect_error', (e) => reject(e));
    });

    // -------------------------------------------------------------------------
    // STEP 8: Employer Connects to Socket.IO Namespace /messages
    // -------------------------------------------------------------------------
    console.log('\n[STEP 8] Employer Connecting to Socket.IO /messages...');
    employerSocket = io(socketUrl, {
      auth: { token: employer.token },
      transports: ['websocket'],
      forceNew: true,
    });

    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Employer socket connection timeout')), 5000);
      employerSocket.on('connect', () => {
        clearTimeout(t);
        assert(employerSocket.connected, `Employer connected to Socket.IO (socketId: ${employerSocket.id})`);
        resolve();
      });
      employerSocket.on('connect_error', (e) => reject(e));
    });

    // -------------------------------------------------------------------------
    // STEP 9: Worker Joins Conversation Room
    // -------------------------------------------------------------------------
    console.log('\n[STEP 9] Worker Joins Conversation Room...');
    await new Promise((resolve) => {
      workerSocket.emit('join_conversation', { conversationId: conversation.id }, (ack) => {
        assert(ack && ack.status === 'joined', `Worker joined room conversation:${conversation.id}`);
        resolve();
      });
    });

    // -------------------------------------------------------------------------
    // STEP 10: Employer Joins Conversation Room
    // -------------------------------------------------------------------------
    console.log('\n[STEP 10] Employer Joins Conversation Room...');
    await new Promise((resolve) => {
      employerSocket.emit('join_conversation', { conversationId: conversation.id }, (ack) => {
        assert(ack && ack.status === 'joined', `Employer joined room conversation:${conversation.id}`);
        resolve();
      });
    });

    // -------------------------------------------------------------------------
    // STEP 11 & 12: Worker Sends Message via REST, Employer Receives via WebSocket
    // -------------------------------------------------------------------------
    console.log('\n[STEP 11 & 12] Worker Sends Message via REST, Employer Receives via WebSocket...');
    const clientMsgId1 = `e2e-msg-${Date.now()}-1`;
    let messageReceivedOnEmployerSocket = null;

    const employerReceivePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Employer did not receive message via WS')), 6000);
      employerSocket.once('message.new', (msg) => {
        clearTimeout(timeout);
        messageReceivedOnEmployerSocket = msg;
        resolve(msg);
      });
    });

    const sendRes1 = await workerApi('POST', `/conversations/${conversation.id}/messages`, {
      body: 'Namaste Sir, I saw the job post and am ready to start on Monday.',
      clientMessageId: clientMsgId1,
    });
    const sentMsg1 = getPayload(sendRes1);
    assert(sendRes1.status === 201 && sentMsg1.id, `Worker sent message via REST (ID: ${sentMsg1.id})`);

    await employerReceivePromise;
    assert(
      messageReceivedOnEmployerSocket && messageReceivedOnEmployerSocket.id === sentMsg1.id,
      `Employer received message in real-time via WebSocket (Body: "${messageReceivedOnEmployerSocket.body}")`
    );

    // -------------------------------------------------------------------------
    // STEP 13 & 14: Employer Marks Read, Worker Receives Read Receipt via WebSocket
    // -------------------------------------------------------------------------
    console.log('\n[STEP 13 & 14] Employer Marks Read, Worker Receives Read Receipt...');
    let readReceiptReceivedOnWorkerSocket = null;

    const workerReceiptPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Worker did not receive read receipt via WS')), 6000);
      workerSocket.once('receipt.read', (receipt) => {
        clearTimeout(timeout);
        readReceiptReceivedOnWorkerSocket = receipt;
        resolve(receipt);
      });
    });

    const readRes = await employerApi('POST', `/conversations/${conversation.id}/read`, {
      lastReadMessageId: sentMsg1.id,
    });
    assert(readRes.status === 200 || readRes.status === 201, `Employer marked conversation read via REST`);

    await workerReceiptPromise;
    const receiptUserId = readReceiptReceivedOnWorkerSocket.userId || readReceiptReceivedOnWorkerSocket.readReceipt?.userId;
    const receiptConvId = readReceiptReceivedOnWorkerSocket.conversationId || readReceiptReceivedOnWorkerSocket.readReceipt?.conversationId;
    assert(
      readReceiptReceivedOnWorkerSocket &&
        receiptConvId === conversation.id &&
        receiptUserId === employer.userId,
      `Worker received read receipt in real time (userId: ${receiptUserId})`
    );

    // -------------------------------------------------------------------------
    // STEP 15 & 16: Worker Types, Employer Receives Typing Indicator
    // -------------------------------------------------------------------------
    console.log('\n[STEP 15 & 16] Worker Dispatches Typing, Employer Receives Typing Indicator...');
    let typingStatusReceived = null;

    const typingPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Employer did not receive typing indicator')), 6000);
      employerSocket.once('typing.status', (data) => {
        clearTimeout(timeout);
        typingStatusReceived = data;
        resolve(data);
      });
    });

    workerSocket.emit('typing', { conversationId: conversation.id, isTyping: true });
    await typingPromise;
    assert(
      typingStatusReceived &&
        typingStatusReceived.conversationId === conversation.id &&
        typingStatusReceived.isTyping === true &&
        typingStatusReceived.userId === worker.userId,
      `Employer received typing indicator (isTyping: true)`
    );

    // -------------------------------------------------------------------------
    // STEP 17: Worker Disconnects (Simulate Offline State)
    // -------------------------------------------------------------------------
    console.log('\n[STEP 17] Worker Disconnects (Simulate Offline State)...');
    workerSocket.disconnect();
    await sleep(500);
    assert(!workerSocket.connected, `Worker disconnected from WebSocket`);

    // -------------------------------------------------------------------------
    // STEP 18: Employer Sends Message While Worker is Offline
    // -------------------------------------------------------------------------
    console.log('\n[STEP 18] Employer Sends Message While Worker is Offline...');
    const clientMsgId2 = `e2e-msg-${Date.now()}-2`;
    const sendRes2 = await employerApi('POST', `/conversations/${conversation.id}/messages`, {
      body: 'Can you bring your own multimeter and safety shoes?',
      clientMessageId: clientMsgId2,
    });
    const sentMsg2 = getPayload(sendRes2);
    assert(sendRes2.status === 201 && sentMsg2.id, `Employer sent message while worker offline (ID: ${sentMsg2.id})`);

    // -------------------------------------------------------------------------
    // STEP 19: Worker Reconnects to WebSocket
    // -------------------------------------------------------------------------
    console.log('\n[STEP 19] Worker Reconnects to WebSocket...');
    workerSocket = io(socketUrl, {
      auth: { token: worker.token },
      transports: ['websocket'],
      forceNew: true,
    });

    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Worker reconnect timeout')), 5000);
      workerSocket.on('connect', () => {
        clearTimeout(t);
        assert(workerSocket.connected, `Worker reconnected to WebSocket (socketId: ${workerSocket.id})`);
        resolve();
      });
      workerSocket.on('connect_error', (e) => reject(e));
    });

    // -------------------------------------------------------------------------
    // STEP 20: Worker Queries REST API and Retrieves Missed Message
    // -------------------------------------------------------------------------
    console.log('\n[STEP 20] Worker Queries REST API to Sync Missed Messages...');
    const syncRes = await workerApi('GET', `/conversations/${conversation.id}/messages?limit=20`);
    const syncData = getPayload(syncRes);
    const messages = syncData.messages || [];
    const missedMsgFound = messages.some((m) => m.id === sentMsg2.id);
    assert(
      syncRes.status === 200 && missedMsgFound,
      `Worker REST sync successfully retrieved missed message (${sentMsg2.id})`
    );

    // -------------------------------------------------------------------------
    // STEP 21: Duplicate Message Send Retry (Idempotency Verification)
    // -------------------------------------------------------------------------
    console.log('\n[STEP 21] Duplicate Message Send Retry (Testing Idempotency)...');
    const duplicateRes = await workerApi('POST', `/conversations/${conversation.id}/messages`, {
      body: 'Namaste Sir, I saw the job post and am ready to start on Monday.',
      clientMessageId: clientMsgId1, // Same as Step 11
    });
    const dupMsg = getPayload(duplicateRes);
    assert(
      (duplicateRes.status === 200 || duplicateRes.status === 201) && dupMsg.id === sentMsg1.id,
      `Idempotent retry returned original message without duplicate insertion (ID: ${dupMsg.id})`
    );

    const countInDb = await prisma.message.count({
      where: { conversationId: conversation.id, clientMessageId: clientMsgId1 },
    });
    assert(countInDb === 1, `Verified exactly 1 message exists in DB with clientMessageId ${clientMsgId1}`);

    // -------------------------------------------------------------------------
    // STEP 22: Unauthorized Access Rejection (IDOR Protection)
    // -------------------------------------------------------------------------
    console.log('\n[STEP 22] Unauthorized User Attempts Access (IDOR Protection)...');
    intruder = await authenticateUser(intruderPhone, 'WORKER');
    const intruderApi = api(intruder.token);

    const intruderReadRes = await intruderApi('GET', `/conversations/${conversation.id}`);
    assert(
      intruderReadRes.status === 403 || intruderReadRes.status === 404,
      `Intruder blocked from viewing conversation (Status: ${intruderReadRes.status})`
    );

    const intruderSendRes = await intruderApi('POST', `/conversations/${conversation.id}/messages`, {
      body: 'Malicious injected message',
      clientMessageId: `intruder-${Date.now()}`,
    });
    assert(
      intruderSendRes.status === 403 || intruderSendRes.status === 404,
      `Intruder blocked from sending message to conversation (Status: ${intruderSendRes.status})`
    );

    // Intruder attempting to join WebSocket room
    const intruderSocket = io(socketUrl, {
      auth: { token: intruder.token },
      transports: ['websocket'],
      forceNew: true,
    });
    await new Promise((resolve) => {
      intruderSocket.on('connect', () => {
        intruderSocket.emit('join_conversation', { conversationId: conversation.id }, (ack) => {
          assert(ack && (ack.status === 'forbidden' || ack.status === 'unauthorized' || ack.success === false), `Intruder room join rejected over WebSocket (ack: ${JSON.stringify(ack)})`);
          intruderSocket.disconnect();
          resolve();
        });
      });
    });

    // -------------------------------------------------------------------------
    // STEP 23: Worker Blocks Employer -> Subsequent Send Rejected
    // -------------------------------------------------------------------------
    console.log('\n[STEP 23] Worker Blocks Employer...');
    const blockRes = await workerApi('POST', `/users/${employer.userId}/block`, {
      reason: 'Dispute over tools',
    });
    assert(blockRes.status === 200 || blockRes.status === 201, `Worker blocked employer`);

    // Employer attempts to send message now
    const blockedSendRes = await employerApi('POST', `/conversations/${conversation.id}/messages`, {
      body: 'Are you still there?',
      clientMessageId: `blocked-${Date.now()}`,
    });
    assert(
      blockedSendRes.status === 403,
      `Employer message blocked after user was blocked (Status: ${blockedSendRes.status})`
    );

    // -------------------------------------------------------------------------
    // STEP 24: Worker Unblocks Employer & Reports Message
    // -------------------------------------------------------------------------
    console.log('\n[STEP 24] Worker Unblocks Employer & Reports Message...');
    const unblockRes = await workerApi('DELETE', `/users/${employer.userId}/block`);
    assert(unblockRes.status === 200, `Worker unblocked employer`);

    const reportRes = await workerApi('POST', `/messages/${sentMsg2.id}/report`, {
      reason: 'OTHER',
      details: 'Employer asked for non-standard equipment',
    });
    assert(reportRes.status === 200 || reportRes.status === 201, `Worker successfully reported message`);

    const reportInDb = await prisma.reportedMessage.findFirst({
      where: { messageId: sentMsg2.id, reporterId: worker.userId },
    });
    assert(!!reportInDb, `Report verified in database (Report ID: ${reportInDb?.id})`);

    console.log('\n=============================================================');
    console.log(' ✅ ALL 24 VERIFICATION STEPS PASSED SUCCESSFULLY!');
    console.log('=============================================================\n');
  } finally {
    if (workerSocket && workerSocket.connected) workerSocket.disconnect();
    if (employerSocket && employerSocket.connected) employerSocket.disconnect();
    await prisma.$disconnect();
  }
}

runE2E()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ E2E Execution Failed:', err);
    process.exit(1);
  });
