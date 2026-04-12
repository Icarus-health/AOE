class PlayerDefinition {
    constructor(index, name, civ, color, team=null, is_cpu=true) {
        this.index = index;
        this.name = name;
        if (civ === null) {
            // Civ selection happens before the simulation seeds the game RNG
            // (it is part of the game *definition*), so falling back to
            // Math.random here is intentional — the picked value is captured
            // in the definition and broadcast to every peer at lobby start.
            this.civ = Math.floor(Math.random() * CIVILIZATIONS.length);
        } else {
            this.civ = civ;
        }
        this.resources = { ...this.RESOURCES };

        this.color = color;
        this.startingAge = 0;
        this.team = team;
        this.is_cpu = is_cpu;
    }
}
PlayerDefinition.prototype.RESOURCES = {
    wood: 400,
    food: 400,
    stone: 400,
    gold: 400
};


const RESOURCE_TYPES = {
    NONE: 0,
    FOOD: 1,
    WOOD: 2,
    STONE: 3,
    GOLD: 4
};

const RESOURCE_NAME = [null, "food", "wood", "stone", "gold"]

const PLAYER_COLORS = [
    'rgb(39, 63, 143)',
    'rgb(227, 11, 0)',
    'rgb(255, 255, 0)',
    'rgb(115, 71, 39)',
    'rgb(243, 119, 15)',
    'rgb(55, 95, 39)',
    'rgb(179, 179, 179)',
    'rgb(43, 191, 147)'
];


// Medieval civilisation roster — modelled after Age of Empires 2.
// IDs 0..3 keep their old slots so existing saves and the AI's hard-coded
// civ indices remain valid; IDs 4..7 are the medieval newcomers.
//
// The string labels are the *display names*. The dual int↔string lookup
// table is used by the lobby UI and replay header.
const CIVILIZATIONS = {
    BRITONS: 0,
    FRANKS: 1,
    BYZANTINES: 2,
    GOTHS: 3,
    SARACENS: 4,
    VIKINGS: 5,
    TEUTONS: 6,
    MONGOLS: 7,
    0: "Britons",
    1: "Franks",
    2: "Byzantines",
    3: "Goths",
    4: "Saracens",
    5: "Vikings",
    6: "Teutons",
    7: "Mongols",
    length: 8
}
const CIVILIZATIONS_NAMES = [
    "Britons",
    "Franks",
    "Byzantines",
    "Goths",
    "Saracens",
    "Vikings",
    "Teutons",
    "Mongols"
];

const AGES = {
    STONE_AGE: 0,
    TOOL_AGE: 1,
    BRONZE_AGE: 2,
    IRON_AGE: 3,
}

const UNIT_TYPES = {
    BUILDING: "building",
    ANIMAL: "animal",
    ARCHER: "archer",
    CAVALRY: "cavalry",
    FISHING_BOAT: "fishing_boat",
    INFANTRY: "infantry",
    PRIEST: "priest",
    SHIP: "ship",
    SIEGE: "siege",
    VILLAGER: "villager",
}

const FPS = 35;

function to_binary(num) {
    let bin = (+num).toString(2);
    return "00000000".substr(bin.length) + bin;
}

function leftpad(val, width, pad) {
    let str = val.toString();
    return Array(width + 1).join(pad).substr(str.length) + val;
}

// Use the deterministic engine RNG via late binding so the import graph
// stays acyclic — utils.js cannot import from engine/.
let _gameRandomImpl = Math.random;
function _setGameRandomImpl(fn) { _gameRandomImpl = fn; }

function rand_choice(choices) {
    return choices[Math.floor(_gameRandomImpl() * choices.length)];
}

function distance(p1, p2) {
    return Math.sqrt(((p1.x - p2.x) ** 2) + ((p1.y - p2.y) ** 2));
}

function manhatan_subtile_distance(p1, p2) {
    return Math.abs(p1.subtile_x - p2.subtile_x) + Math.abs(p1.subtile_y - p2.subtile_y);
}

function rect_intersection(r1, r2) {
    return !(
        r1.x + r1.w < r2.x || r1.x > r2.x + r2.w ||
        r1.y + r1.h < r2.y || r1.y > r2.y + r2.h
    );
}

function getCanvasContext(width, height) {
    let canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas.getContext("2d");
}

export {
    PlayerDefinition, PLAYER_COLORS, RESOURCE_TYPES, RESOURCE_NAME,
    AGES, CIVILIZATIONS, CIVILIZATIONS_NAMES, UNIT_TYPES, FPS,
    to_binary, leftpad, rand_choice, rect_intersection, distance,
    manhatan_subtile_distance, getCanvasContext,
    _setGameRandomImpl
}
