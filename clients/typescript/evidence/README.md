# Private Compute client preparation results

The six reports in this directory are the actual exports of
[run 37898833698](https://github.com/zodiacs-org/engine/actions/runs/37898833698),
on head `eddfb59534f8aaa1bd6c08afc3511b55f099b3cd`, checked out as
`0b998ad2c881c408fb2845e56f4563cf76d52118`. Their original bytes and SHA-256 were verified
before commitment; `validation.json` names each producing job.

Node 20.20.2, 22.23.3 and 24.21.0 passed the generated-contract check,
positive/negative TypeScript contracts, isolated build and all 26 runtime
checks. Each runtime also packed this private package to a temporary
directory outside the checkout, installed it with TypeScript 5.9.3 into a
fresh consumer, compiled the same public request contracts against the
installed declarations and ran the 26 runtime checks against installed JS.
No tests were skipped; temporary consumers were removed.

The historical producer's three packs were byte-identical:
8,227 bytes, SHA-256
`5f686995426934f6f689451ba8306d48e149ebee7463e038ccb329beb736ab81`.
Their file lists are in the reports. Final-carrier documentation may change
the temporary package bytes; the final-head workflow independently checks
the package it builds and installs. This is not a carried engine archive.

The package remains private at 0.0.0. Contract fixtures, errors, cancellation
and timeout checks establish client behavior; they are not independent
astronomical accuracy evidence. Core engine CI, archive rebuild, packed
consumers, conformance, atlas and Python gates remain required on the final
carrier. No registry publication, P3.4 acceptance or private scan clearance
is claimed. Private release-range and staged search inputs remain unavailable.
