# Private source identity correction

Source `80be3f97a69414db52b58007ad04891869b5eb2f` refuses empty or whitespace-only provider version/ephemeris identifiers, including metadata changed after scanner construction, before executing a provider. The positive case retains the explicitly supplied identity.

[Original lightweight producer 38043491707](https://github.com/zodiacs-org/engine/actions/runs/38043491707) passes nine source controls on both Node 22.22.2 and Node 24.21.0, with no failures or skips. Each runtime also passes the earlier independent linear arithmetic, installed exports and strict ES2022 declaration controls. The private pack is 4,645 bytes, SHA-256 `9c8678d7c5b14b6cc73573667a675bd740f618982a1782f26e8bf4377ad15f8f`. Earlier source/pack reports remain historical. [identity-validation.json](identity-validation.json) retains the actual producer and consumer reports.

These are protocol and arithmetic observations. Actual solar ephemeris execution, independent astronomical comparison, normative frame/clock definitions, completeness, full repository gates and publication remain open. The carried engine and rc.2 archive are unchanged.
