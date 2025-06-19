# Changelog

## [1.22.1](https://github.com/Dydhzo/AIOStreams/compare/v1.22.0...v1.22.1)


### Optimisation de la détection de la langue française

Cette mise à jour renforce les capacités de détection de la langue française dans les descriptions.

**Modification clé dans :** [`packages/parser/src/regex.ts`](https://github.com/Dydhzo/AIOStreams/blob/main/packages/parser/src/regex.ts)

Le modèle d'expression régulière pour le français a été mis à jour pour reconnaître un éventail plus large d'alias. Désormais, en plus de `french` et `fra`, le système identifiera également `fr`, `vf`, `vff`, `vfi`, `vf2`, `vfq`, et `truefrench`.

Cela garantit une identification plus complète et plus précise du contenu français.
