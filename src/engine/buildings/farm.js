import { Building } from './building.js';
import { Sprites } from '../../sprites.js';

class Farm extends Building {
    getResource(engine) {
        if (this.attributes.food > 0) {
            if (--this.attributes.food == 0) {
                // AoE2-style auto-reseed: if the player has the option enabled
                // and can afford the wood cost, refill the farm in place
                // instead of destroying it. This keeps the farmer interaction
                // alive so the villager loops onto the same tile without an
                // idle gap.
                if (this.tryAutoReseed(engine)) return 1;
                this.destroy(engine);
            }
            return 1;
        }
        return 0;
    }
    tryAutoReseed(engine) {
        if (!this.player) return false;
        if (this.player.autoReseedFarms === false) return false;
        const cost = Farm.prototype.COST;
        if (this.player.deficitResource(cost)) return false;
        this.player.subtractResources(cost);
        this.attributes.food = 250 + this.player.attributeBonus.farm.food;
        return true;
    }
    setComplete() {
        super.setComplete();
        this.attributes.food = 250 + this.player.attributeBonus.farm.food;
    }
    static isResearched(player) {
        return player.possessions.Market && player.possessions.ToolAge;
    }
}
Farm.prototype.NAME = "Farm";
Farm.prototype.AVATAR = [
    [
        Sprites.Sprite("img/interface/avatars/farm.png"),
        Sprites.Sprite("img/interface/avatars/farm.png"),
        Sprites.Sprite("img/interface/avatars/farm.png"),
        Sprites.Sprite("img/interface/avatars/farm.png")
    ]
];
Farm.prototype.MAX_HP = [50];
Farm.prototype.SUBTILE_WIDTH = 5;
Farm.prototype.INTERACT_WHEN_COMPLETE = true;
Farm.prototype.EXPLOSION = null;

Farm.prototype.ACTION_KEY = "F";
Farm.prototype.COST = {
    food: 0, wood: 75, stone: 0, gold: 0
}

Farm.prototype.IMAGES = {
    ...Building.prototype.IMAGES,
    [Building.prototype.STATE.DONE]: [
        [
            [Sprites.Sprite("img/buildings/farm/all.png")],
            [Sprites.Sprite("img/buildings/farm/all.png")],
            [Sprites.Sprite("img/buildings/farm/all.png")],
            [Sprites.Sprite("img/buildings/farm/all.png")]
        ]
    ],
    [Building.prototype.STATE.DESTROYED]: [
        [
            [Sprites.Sprite("img/buildings/farm/exhausted.png")],
            [Sprites.Sprite("img/buildings/farm/exhausted.png")],
            [Sprites.Sprite("img/buildings/farm/exhausted.png")],
            [Sprites.Sprite("img/buildings/farm/exhausted.png")]
        ]
    ]
}

Farm.prototype.IMAGE_OFFSETS = {
    ...Building.prototype.IMAGE_OFFSETS,
    [Building.prototype.STATE.DONE]: [
        [{ x: 17, y: 44 }, { x: 17, y: 44 }, { x: 17, y: 44 }, { x: 17, y: 44 }]
    ],
    [Building.prototype.STATE.DESTROYED]: [
        [{ x: -1, y: 33 }, { x: -1, y: 33 }, { x: -1, y: 33 }, { x: -1, y: 33 }]
    ]
}


export { Farm }
