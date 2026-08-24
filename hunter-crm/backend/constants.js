// Shared vocabulary for the pipeline. Kept in one place so routes, validation
// and the dashboard's weighted forecast never drift apart.

const OPEN_STAGES = ['PROSPECTING', 'QUALIFYING', 'DEMO', 'PROPOSAL', 'NEGOTIATION'];
const CLOSED_STAGES = ['WON', 'LOST'];
const STAGES = [...OPEN_STAGES, ...CLOSED_STAGES];

// Probability of closing, by stage — used for the weighted pipeline figure.
const STAGE_PROBABILITY = {
    PROSPECTING: 0.10,
    QUALIFYING: 0.25,
    DEMO: 0.45,
    PROPOSAL: 0.65,
    NEGOTIATION: 0.85,
    WON: 1,
    LOST: 0,
};

const CONTACT_STATUSES = ['NEW', 'WORKING', 'QUALIFIED', 'NURTURING', 'DISQUALIFIED'];
const CONTACT_SOURCES = ['OUTBOUND', 'INBOUND', 'REFERRAL', 'EVENT', 'LINKEDIN', 'LIST'];
const ACTIVITY_TYPES = ['CALL', 'EMAIL', 'MEETING', 'LINKEDIN', 'NOTE'];

module.exports = {
    OPEN_STAGES,
    CLOSED_STAGES,
    STAGES,
    STAGE_PROBABILITY,
    CONTACT_STATUSES,
    CONTACT_SOURCES,
    ACTIVITY_TYPES,
};
