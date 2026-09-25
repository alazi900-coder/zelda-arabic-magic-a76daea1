#include "follower_pokemon.h"

#include <nitro.h>

#include "constants/map_object.h"
#include "constants/species.h"

#include "generated/movement_types.h"
#include "generated/object_events_gfx.h"
#include "generated/pokemon_data_params.h"

#include "field/field_system.h"

#include "map_header.h"
#include "map_object.h"
#include "party.h"
#include "player_avatar.h"
#include "pokemon.h"

// The party-slot-0 "walking Pokemon" map object currently spawned on the
// field, or NULL if none is spawned (indoors, empty party, egg, or species
// without field-sprite art). There is only ever one player, so a single
// tracked object is sufficient.
static MapObject *sFollowerMapObject = NULL;

// Maps a species to its overworld field-sprite graphics ID. Only species
// with art in res/graphics/field_sprites/pokemon/ are listed; anything else
// falls through to OBJ_EVENT_GFX_INVISIBLE so the follower is simply not
// shown (art for the rest is future work, not part of this feature).
static u16 FollowerPokemon_GetGraphicsID(u16 species)
{
    switch (species) {
    case SPECIES_PIKACHU:
        return OBJ_EVENT_GFX_PIKACHU;
    case SPECIES_CLEFAIRY:
        return OBJ_EVENT_GFX_CLEFAIRY;
    case SPECIES_JIGGLYPUFF:
        return OBJ_EVENT_GFX_JIGGLYPUFF;
    case SPECIES_PSYDUCK:
        return OBJ_EVENT_GFX_PSYDUCK;
    case SPECIES_TORCHIC:
        return OBJ_EVENT_GFX_TORCHIC;
    case SPECIES_SKITTY:
        return OBJ_EVENT_GFX_SKITTY;
    case SPECIES_PACHIRISU:
        return OBJ_EVENT_GFX_PACHIRISU;
    case SPECIES_DRIFLOON:
        return OBJ_EVENT_GFX_DRIFLOON;
    case SPECIES_BUNEARY:
        return OBJ_EVENT_GFX_BUNEARY;
    case SPECIES_HAPPINY:
        return OBJ_EVENT_GFX_HAPPINY;
    case SPECIES_SHROOMISH:
        return OBJ_EVENT_GFX_SHROOMISH;
    case SPECIES_TURTWIG:
        return OBJ_EVENT_GFX_TURTWIG;
    case SPECIES_GROTLE:
        return OBJ_EVENT_GFX_GROTLE;
    case SPECIES_TORTERRA:
        return OBJ_EVENT_GFX_TORTERRA;
    case SPECIES_CHIMCHAR:
        return OBJ_EVENT_GFX_CHIMCHAR;
    case SPECIES_MONFERNO:
        return OBJ_EVENT_GFX_MONFERNO;
    case SPECIES_INFERNAPE:
        return OBJ_EVENT_GFX_INFERNAPE;
    case SPECIES_PIPLUP:
        return OBJ_EVENT_GFX_PIPLUP;
    case SPECIES_PRINPLUP:
        return OBJ_EVENT_GFX_PRINPLUP;
    case SPECIES_EMPOLEON:
        return OBJ_EVENT_GFX_EMPOLEON;
    case SPECIES_CROAGUNK:
        return OBJ_EVENT_GFX_CROAGUNK;
    case SPECIES_STARLY:
        return OBJ_EVENT_GFX_STARLY;
    case SPECIES_MACHOP:
        return OBJ_EVENT_GFX_MACHOP;
    case SPECIES_MAGIKARP:
        return OBJ_EVENT_GFX_MAGIKARP;
    case SPECIES_UXIE:
        return OBJ_EVENT_GFX_UXIE;
    case SPECIES_MESPRIT:
        return OBJ_EVENT_GFX_MESPRIT;
    case SPECIES_AZELF:
        return OBJ_EVENT_GFX_AZELF;
    case SPECIES_DIALGA:
        return OBJ_EVENT_GFX_DIALGA;
    case SPECIES_PALKIA:
        return OBJ_EVENT_GFX_PALKIA;
    case SPECIES_GIRATINA:
        return OBJ_EVENT_GFX_GIRATINA_ALTERED;
    case SPECIES_HEATRAN:
        return OBJ_EVENT_GFX_HEATRAN;
    case SPECIES_REGIGIGAS:
        return OBJ_EVENT_GFX_REGIGIGAS;
    case SPECIES_CRESSELIA:
        return OBJ_EVENT_GFX_CRESSELIA;
    case SPECIES_DARKRAI:
        return OBJ_EVENT_GFX_DARKRAI;
    case SPECIES_SHAYMIN:
        return OBJ_EVENT_GFX_SHAYMIN;
    case SPECIES_ARCEUS:
        return OBJ_EVENT_GFX_ARCEUS;
    case SPECIES_ROTOM:
        return OBJ_EVENT_GFX_ROTOM_WASH;
    default:
        return OBJ_EVENT_GFX_INVISIBLE;
    }
}

// Returns SPECIES_NONE for an empty party, an egg in slot 0, or a species
// with no field-sprite graphics -- in every such case the follower should
// not be shown.
static u16 FollowerPokemon_GetVisibleLeadSpecies(FieldSystem *fieldSystem)
{
    Party *party = SaveData_GetParty(fieldSystem->saveData);

    if (Party_GetCurrentCount(party) == 0) {
        return SPECIES_NONE;
    }

    Pokemon *mon = Party_GetPokemonBySlotIndex(party, 0);

    if (Pokemon_GetValue(mon, MON_DATA_IS_EGG, NULL)) {
        return SPECIES_NONE;
    }

    return Pokemon_GetValue(mon, MON_DATA_SPECIES, NULL);
}

// One tile behind the player, based on the direction they're currently
// facing, so the follower appears already in trailing position as soon as
// the map loads.
static void FollowerPokemon_GetSpawnPos(FieldSystem *fieldSystem, int *x, int *z)
{
    *x = fieldSystem->location->x;
    *z = fieldSystem->location->z;

    switch (fieldSystem->location->faceDirection) {
    case DIR_NORTH:
        *z += 1;
        break;
    case DIR_SOUTH:
        *z -= 1;
        break;
    case DIR_WEST:
        *x += 1;
        break;
    case DIR_EAST:
        *x -= 1;
        break;
    }
}

void FollowerPokemon_OnMapLoad(FieldSystem *fieldSystem)
{
    sFollowerMapObject = NULL;

    if (MapHeader_IsOutdoors(fieldSystem->location->mapHeaderID) == FALSE) {
        // Caves/buildings are out of scope for this pass; simply don't spawn.
        return;
    }

    u16 species = FollowerPokemon_GetVisibleLeadSpecies(fieldSystem);
    u16 graphicsID = FollowerPokemon_GetGraphicsID(species);

    if (graphicsID == OBJ_EVENT_GFX_INVISIBLE) {
        return;
    }

    int x, z;
    FollowerPokemon_GetSpawnPos(fieldSystem, &x, &z);

    sFollowerMapObject = MapObjectMan_AddMapObject(fieldSystem->mapObjMan, x, z, fieldSystem->location->faceDirection, graphicsID, MOVEMENT_TYPE_FOLLOW_PLAYER, fieldSystem->location->mapHeaderID);

    if (sFollowerMapObject != NULL) {
        MapObject_RecalculateObjectHeight(sFollowerMapObject);
    }
}

void FollowerPokemon_OnPartyChanged(FieldSystem *fieldSystem)
{
    if (fieldSystem == NULL || MapHeader_IsOutdoors(fieldSystem->location->mapHeaderID) == FALSE) {
        return;
    }

    u16 species = FollowerPokemon_GetVisibleLeadSpecies(fieldSystem);
    u16 graphicsID = FollowerPokemon_GetGraphicsID(species);

    if (graphicsID == OBJ_EVENT_GFX_INVISIBLE) {
        if (sFollowerMapObject != NULL) {
            MapObject_Delete(sFollowerMapObject);
            sFollowerMapObject = NULL;
        }
        return;
    }

    if (sFollowerMapObject != NULL) {
        MapObject_SetGraphicsID(sFollowerMapObject, graphicsID);
        return;
    }

    // No follower was shown before (e.g. the previous lead had no
    // field-sprite art) but the new lead does -- spawn one right behind
    // the player's current position.
    PlayerAvatar *playerAvatar = fieldSystem->playerAvatar;
    int dir = PlayerAvatar_GetFacingDir(playerAvatar);
    int x = PlayerAvatar_GetXPos(playerAvatar);
    int z = PlayerAvatar_GetZPos(playerAvatar);

    switch (dir) {
    case DIR_NORTH:
        z += 1;
        break;
    case DIR_SOUTH:
        z -= 1;
        break;
    case DIR_WEST:
        x += 1;
        break;
    case DIR_EAST:
        x -= 1;
        break;
    }

    sFollowerMapObject = MapObjectMan_AddMapObject(fieldSystem->mapObjMan, x, z, dir, graphicsID, MOVEMENT_TYPE_FOLLOW_PLAYER, fieldSystem->location->mapHeaderID);

    if (sFollowerMapObject != NULL) {
        MapObject_RecalculateObjectHeight(sFollowerMapObject);
    }
}
