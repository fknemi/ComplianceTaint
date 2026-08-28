// Zone: gdpr

const mockDb = {
    "123": { id: "123", name: "John Doe", email: "john.doe@example.com", phone: "+1234567890" }
};

// SINK
function logActivity(action, details) {
    console.log(`[ACTIVITY LOG] Action: ${action} - Details: ${details}`);
}

// PII SOURCE
function getUserProfile(userId) {
    const user = mockDb[userId];
    if (user) {
        // Planted Rule 1 violation: Passing raw PII (email) directly to a sink without a sanitizer
        logActivity('VIEW_PROFILE', user.email);
    }
    return user;
}

function updateUserProfile(userId, data) {
    if (mockDb[userId]) {
        mockDb[userId] = { ...mockDb[userId], ...data };
        logActivity('UPDATE_PROFILE', `Updated user ${userId}`);
    }
    return mockDb[userId];
}

module.exports = {
    getUserProfile,
    updateUserProfile,
    logActivity
};