#ifndef POKEPLATINUM_FOLLOWER_POKEMON_H
#define POKEPLATINUM_FOLLOWER_POKEMON_H

#include "field_system.h"

// Spawns (or hides) the walking follower Pokemon for the current map, based
// on whichever species currently occupies party slot 0. Safe to call for
// any map; it only spawns a follower on outdoor maps for species that have
// field-sprite art.
void FollowerPokemon_OnMapLoad(FieldSystem *fieldSystem);

// Refreshes the currently-spawned follower's appearance after party slot 0
// has changed (e.g. the player reordered their party). No-op if no follower
// is currently spawned.
void FollowerPokemon_OnPartyChanged(FieldSystem *fieldSystem);

#endif // POKEPLATINUM_FOLLOWER_POKEMON_H
