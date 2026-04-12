# Hotkey reference

All gameplay actions go through the lockstep command queue, which means
multiplayer peers see the same effect on the same simulation turn.

## Camera

| Key             | Action                       |
|-----------------|------------------------------|
| Arrow keys      | Pan the camera               |

## Selection & control groups

| Key             | Action                                                |
|-----------------|-------------------------------------------------------|
| 1..9            | Recall control group                                  |
| Ctrl+1..9       | Store current selection as a control group            |

## Unit commands

| Key             | Action                                                |
|-----------------|-------------------------------------------------------|
| A               | (placeholder) attack-move sound cue                   |
| S               | Stop the current interaction                          |
| H               | Hold position (set to idle without losing the order)  |
| P               | Arm patrol — next left-click is the patrol target     |
| Shift+F         | Cycle group formation: Box → Line → Flank             |

## Stances (AoE2)

| Key             | Stance                                                |
|-----------------|-------------------------------------------------------|
| F1              | Aggressive (chase any enemy in sight)                 |
| F2              | Defensive (return fire, stay near home)               |
| F3              | Stand Ground (attack only enemies in range)           |
| F4              | No Attack (ignore enemies entirely)                   |

## Buildings

| Key             | Action                                                |
|-----------------|-------------------------------------------------------|
| G               | Garrison selected unit into nearest Tower / TownCenter|
| G *(on building)* | Ungarrison everything from the selected building   |
| O               | Toggle the selected Gate (open ↔ closed)              |
| `` ` `` (backtick) | Town Bell — recall every villager                  |

## Audio

| Key             | Action                                                |
|-----------------|-------------------------------------------------------|
| M               | Toggle global mute                                    |

## Multiplayer

The DOM **Multiplayer** button on the main menu opens the lobby. See
`docs/MULTIPLAYER.md` for the host / join walkthrough.
