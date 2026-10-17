# Global optimality for one through seven games, and the eight-game case

Independent derivation, 2026-10-18. Assumption: every six-element winning set from
1 through 45 is equally likely. Event: at least one ticket has three or more
main-number matches. This is a mathematical result, not a historical prediction.

## Splitting lemma

Consider any portfolio. Let x appear in at least two tickets and let y appear
in none. Partition the tickets containing x into nonempty groups A and B.
Replace x with y in group A, leaving group B unchanged. Every ticket still has
six distinct numbers.

Partition all possible draws into these cases:

1. Draws containing neither x nor y: every ticket retains its hit count.
2. Draws containing both x and y: every ticket retains its hit count.
3. Draws containing exactly one: pair R union {x} with R union {y}, where R is
   a five-element set excluding x and y.

For case 3, if R already gives some ticket at least three hits, both draws win
before and after the replacement. Otherwise let C be the tickets containing x
that have exactly two matches with R. Before replacement, the pair contains
1(C is nonempty) successful draws. After replacement, it contains
1(C intersects A) + 1(C intersects B) successful draws. This cannot be smaller.

Thus splitting never decreases the number of winning draws. The same argument
works for any fixed match threshold and uniform fixed-size draws.

## Consequence for 1 through 7 games

If a label is shared and the total number of ticket entries is at most 45,
some label is unused. Repeatedly split one occurrence off a shared label to
an unused label. Each split increases the number of used labels by one and
does not decrease winning coverage. This ends in completely disjoint tickets.

For m <= 7, all 6m ticket entries fit in 45 labels. Therefore completely
disjoint tickets are a GLOBAL maximum over every possible m-ticket portfolio,
including portfolios with pairwise overlap greater than one. They are not
merely the best candidates found by a search.

For disjoint tickets, one ticket covers K=194130 possible six-number draws.
Two tickets win together in exactly C(6,3)^2=400 draws. Three cannot all win,
because that would require at least nine winning numbers. Consequently:

    maximum favorable outcomes = m*194130 - 400*C(m,2)
    maximum probability = favorable / 8145060

For five games the exact maximum is 966650/8145060 = 11.867929763562209%.
The existing five-game generator attains this maximum. A nonlinear overlap
configuration cannot improve it under the stated fair-draw assumptions.

The existing ANALYSIS.md says global optimality for this case was not proved
and supplies a looser 11.897395% upper bound. The splitting proof supersedes
that uncertainty for 1 through 7 games. The separate classification below
also resolves eight games. No global claim is made for nine or more games.

## Eight games: complete finite classification

If fewer than 45 labels are used by eight tickets, the splitting lemma can
be applied until all 45 are used, without reducing coverage. There are then
48 total incidences and 45 used labels, so the sum over used labels of
(number of tickets containing that label minus one) is exactly three.

The only possibilities are three shared labels each in two tickets, one
label in three tickets plus one in two tickets, or one label in four tickets.
For the first case, the three-edge multigraph has eight shapes: matching,
wedge plus separate edge, path, star, triangle, double edge plus separate
edge, double edge plus adjacent edge, or triple edge. For the second case,
the triple and pair supports intersect in zero, one, or two tickets. The
third case has one shape. All other labels occur in exactly one ticket.
These 12 possibilities are complete up to ticket ordering and label renaming.

Exact winning-domain enumeration gives the largest coverage for the
triangle: 1,532,004/8,145,060 = 18.808996%. The four other simple-edge shapes
give 1,531,940. All nonlinear or higher-multiplicity shapes are lower (full
counts and example portfolios are in the JSON). The existing eight-game
template attains this global maximum. This conclusion combines a mathematical
reduction and complete finite classification with exact integer enumeration;
it is not a bounded heuristic search.

## A concrete opportunity across saved batches

The present dist/app.js generation path (lines 129-143 when inspected) bans
exact saved-ticket duplicates in the selected round but does not optimize
partial overlaps across saved and newly generated batches. Current per-batch
templates optimize only the new batch.

Any existing five disjoint tickets can be extended by five new tickets to
match the current ten-game template's probability, without changing the
existing tickets. Relabel the old tickets as {1..6}, {7..12}, {13..18},
{19..24}, {25..30}. For five new tickets, use one different label from {1..5}
each, assign one fresh label to each of their ten pairs, then give each one
private fresh label. This uses all labels 1..45. The ticket-intersection graph
is K6 plus four isolated vertices, identical in structure to current best10.

The independent audit script saves the full example. Both the linear formula
and winning-domain bitset enumeration give 1,875,065/8,145,060 = 23.020886279536307%.

For comparison, two independently uniformly relabeled disjoint-five batches
have exact average coverage 1-(1-p5)^2 = 22.327381958395964%. The difference
is 0.6935043211403424 percentage points, at the SAME ten-game cost. This
comparison is an average over independent batches, not a claim that every
possible old pairing is worse.

With popular-number filtering disabled, exact saved-duplicate rejection has
only a bounded effect on that average. For a fixed first five, each of the
25 cross-batch equality events has probability 1/8145060. Thus rejection
probability is at most 25/8145060, and conditioning on acceptance changes
expected coverage by at most 0.0003069345099974709 percentage points.
The independent average is not an exact statistic for modes that also select
popular-number scores. The concrete extension's probability remains exact.

For three and four independent five-game batches, the corresponding exact
unfiltered averages are 31.545513713093487% and 39.66964406563088%. The current
joint 15/20 templates give 33.46429615005905% and 42.63177926252231%. These
larger comparisons do not show that already purchased batches can always be
extended to those exact templates.

## Independent checks and limits

Run `node data/portfolio-research/splitting-optimality-20261018.cjs`.

- All 6,545 distinct three-ticket portfolios of three-number tickets over
  seven labels were examined with three-number draws and threshold two.
  All 68,040 applicable splitting operations were nondecreasing (strict here).
- A deliberately nonlinear five-ticket Lotto portfolio was split 14 times.
  Exact winning-domain enumeration was nondecreasing at every step, from
  871,327 to the globally maximal 966,650 covered draws.
- The explicit saved-five-plus-added-five extension was independently checked
  against the existing winning-domain enumerator and linear exact formula.

The finite checks support implementation of the calculations; the pairing
argument, not the finite checks, proves the global statement. No application
code or frozen templates were modified. This maximizes probability of at least
one prize, not expected winning-ticket count, monetary profit, or first prize.
