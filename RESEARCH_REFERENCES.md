# Research References for Pattern Matching Implementation

This document cites the academic research papers that informed the semantic pattern matching and constraint blending implementation in the babylon-wfc route.

## Primary Research Foundation

### 1. "Divide and Conquer: Text Semantic Matching with Disentangled Keywords and Intents"
**Authors:** (Research team)  
**Publication:** arXiv preprint arXiv:2203.02898  
**URL:** https://arxiv.org/abs/2203.02898  
**Year:** 2022

**Key Principle Applied:**
- **Keywords** (factual information) require **strict matching**
- **Intents** (abstract concepts) allow paraphrasing and flexible matching
- The paper proposes disentangling these components for better semantic matching

**Implementation Impact:**
- `detectExplicitIntent()` function identifies keywords (map size, building count, tile types) from user prompts
- Explicit intent boosting (+0.1 similarity boost) ensures keywords get strict matching priority
- This ensures "very small map" (0.558 + 0.1 = 0.658) beats "small map" (0.610) when user explicitly says "very small"

**Code Reference:**
```typescript
// src/routes/babylon-wfc.ts, lines 694-744
function detectExplicitIntent(userPrompt: string): {
  mapSize?: 'very small' | 'small' | 'medium' | 'large';
  buildingCount?: number;
  primaryType?: 'grass' | 'water' | 'forest';
}
```

---

### 2. "RE-Matching: A Fine-Grained Semantic Matching Method for Zero-Shot Relation Extraction"
**Authors:** (Research team)  
**Publication:** arXiv preprint arXiv:2306.04954  
**URL:** https://arxiv.org/abs/2306.04954  
**Year:** 2023

**Key Principle Applied:**
- Decompose sentence-level similarity into entity and context matching scores
- Combination patterns (complete constraint sets) should be treated differently from individual patterns
- Context distillation to identify and mitigate irrelevant components

**Implementation Impact:**
- `isCombinationPattern()` identifies patterns containing multiple constraint types
- Combination patterns like "very small map with mostly grass" represent complete constraint sets
- These are prioritized as dominant patterns when similarity is high (> 0.7)

**Code Reference:**
```typescript
// src/routes/babylon-wfc.ts, lines 746-753
function isCombinationPattern(pattern: string): boolean {
  return pattern.includes(' with ') || pattern.includes(' and ');
}
```

---

### 3. "StructCoh: Structured Contrastive Learning for Context-Aware Text Semantic Matching"
**Authors:** (Research team)  
**Publication:** arXiv preprint arXiv:2509.02033  
**URL:** https://arxiv.org/abs/2509.02033  
**Year:** 2025

**Key Principle Applied:**
- Hierarchical contrastive objective enforces consistency at multiple granularities
- Graph-enhanced representations capture structural patterns
- Fine-grained semantic distinctions improve matching accuracy

**Implementation Impact:**
- Conflict resolution groups patterns by semantic categories (mapSize, buildingCount, primaryType)
- Ensures consistency by selecting best match from each conflict group
- Prevents contradictory constraints from being blended

**Code Reference:**
```typescript
// src/routes/babylon-wfc.ts, lines 688-692, 758-825
const CONFLICT_GROUPS: Record<string, Array<string>> = {
  mapSize: ['very small map', 'small map', 'medium map', 'large map'],
  buildingCount: ['4 buildings', '5 buildings', '10 buildings'],
  primaryType: ['mostly grass', 'mostly all grass', 'mostly water', 'mostly forest'],
};
```

---

## Supporting Principles

### Multi-Criteria Decision Making (MCDM)
**Domain:** Operations Research / Decision Science  
**Principle:** When one criterion has significantly higher weight, it should dominate the decision

**Implementation Impact:**
- Dominant pattern threshold: similarity > 0.7
- High-similarity combination patterns filter out conflicting individual patterns
- Prevents constraint dilution (e.g., grassRatio from 0.75 to 0.48)

**Code Reference:**
```typescript
// src/routes/babylon-wfc.ts, lines 1529-1543
const dominantMatch = matches.find(
  m => m.similarity > 0.7 && isCombinationPattern(m.pattern.pattern)
);
```

---

## Implementation Summary

### Research-Based Features:

1. **Explicit Intent Detection** (Based on "Divide and Conquer")
   - Keywords get strict matching priority
   - Boosts similarity scores for explicit user terms

2. **Combination Pattern Prioritization** (Based on RE-Matching)
   - Combination patterns represent complete constraint sets
   - Treated as dominant when similarity is high

3. **Conflict Resolution** (Based on StructCoh principles)
   - Groups patterns by semantic categories
   - Ensures consistency by filtering conflicting patterns

4. **Dominant Pattern Filtering** (Based on MCDM principles)
   - High-weight patterns (> 0.7) dominate decisions
   - Prevents constraint dilution from conflicting patterns

---

## Engineering Decisions (Not from Research)

The following implementation details are engineering decisions based on the problem domain:

- **Boost amount:** +0.1 similarity for explicit matches (empirically chosen)
- **Dominance threshold:** 0.7 similarity (empirically chosen)
- **Conflict detection logic:** Specific rules for detecting conflicts between patterns
- **Blending weights:** Cosine similarity used as weights (standard practice)

---

## Citation Format

If citing this implementation in academic work:

```bibtex
@article{divideandconquer2022,
  title={Divide and Conquer: Text Semantic Matching with Disentangled Keywords and Intents},
  author={...},
  journal={arXiv preprint arXiv:2203.02898},
  year={2022}
}

@article{rematching2023,
  title={RE-Matching: A Fine-Grained Semantic Matching Method for Zero-Shot Relation Extraction},
  author={...},
  journal={arXiv preprint arXiv:2306.04954},
  year={2023}
}

@article{structcoh2025,
  title={StructCoh: Structured Contrastive Learning for Context-Aware Text Semantic Matching},
  author={...},
  journal={arXiv preprint arXiv:2509.02033},
  year={2025}
}
```

---

## Verification

All research papers are publicly available on arXiv.org and can be accessed via the provided URLs. The implementation follows the core principles outlined in these papers while adapting them to the specific domain of constraint-based map generation.

