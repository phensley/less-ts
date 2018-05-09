import { IBlock, NodeType } from '../common';
import { Argument, Block, Mixin, MixinCallArgs, MixinParams, Ruleset, Selector } from '../model';
import { MixinMatcher } from './mixin';

export interface RulesetMatch {
  kind: 'ruleset';
  selector: Selector;
  ruleset: Ruleset;
}

export interface MixinMatch {
  kind: 'mixin';
  mixin: Mixin;
  params: MixinParams;
}

export type MixinResolverMatch = RulesetMatch | MixinMatch;

export class MixinResolver {

  readonly matches: MixinResolverMatch[] = [];
  readonly args: Argument[];
  readonly callPath: string[];
  readonly callPathSize: number;
  readonly endIndex: number;

  constructor(readonly matcher: MixinMatcher) {
    this.args = matcher.args.args;
    this.callPath = matcher.call.mixinPath || [];
    this.callPathSize = this.callPath.length;
    this.endIndex = this.callPathSize - 1;
  }

  resolve(frames: IBlock[]): boolean {
    const start = frames.length - 1;
    for (let i = start; i >= 0; i--) {
      if (this.match(0, frames[i])) {
        return true;
      }
    }
    return false;
  }

  protected match(index: number, block: IBlock): boolean {
    if (index >= this.callPathSize || !block.hasMixinDefs()) {
      return false;
    }

    const { rules } = block;
    const len = rules.length;
    if (len === 0) {
      return false;
    }

    let matched = false;
    for (let i = 0; i < len; i++) {
      const rule = rules[i];
      if (rule.type === NodeType.RULESET) {
        if (this.matchRuleset(index, rule as Ruleset)) {
          matched = true;
        }
      } else if (rule.type === NodeType.MIXIN) {
        if (this.matchMixin(index, rule as Mixin)) {
          matched = true;
        }
      }
    }
    return matched;
  }

  protected matchRuleset(index: number, ruleset: Ruleset): boolean {
    if (!ruleset.hasMixinPath) {
      return false;
    }
    const original = ruleset.original as Ruleset;
    if (original.evaluating()) {
      return false;
    }

    const { selectors } = ruleset.selectors;
    for (const selector of selectors) {
      const path = selector.mixinPath();
      if (!path) {
        continue;
      }

      const remaining = this.matchPath(index, path);
      if (remaining < 0) {
        continue;
      }

      if (remaining === 0) {
        // Full match, if no args present, add this to results.
        if (this.args.length === 0) {
          this.matches.push({ kind: 'ruleset', ruleset, selector });
          return true;
        }
      } else {
        // Partial match, continue matching the children of this ruleset.
        if (this.match(index + path.length, ruleset.block)) {
          return true;
        }
      }
    }
    return false;
  }

  protected matchMixin(index: number, mixin: Mixin): boolean {
    const matched = this.callPath[index] === mixin.name;
    if (!matched) {
      return false;
    }
    if (index < this.endIndex) {
      // We haven't matched the entire path, so drill deeper.
      return this.match(index + 1, mixin.block);
    }

    const env = this.matcher.callEnv.copy();

    const defEnv = mixin.closure;
    if (defEnv) {
      env.append(defEnv.frames);
    }

    const params = mixin.params.eval(env) as MixinParams;
    const matches = this.matcher.patternMatch(params);
    if (matches) {
      this.matches.push({ kind: 'mixin', mixin, params });
    }
    return matches;
  }

  protected matchPath(index: number, other: string[]): number {
    const otherSize = other.length;
    const currSize = this.callPathSize - index;
    if (otherSize === 0 || currSize < otherSize) {
      return -1;
    }
    let j = 0;
    while (j < otherSize) {
      if (this.callPath[index] !== other[j]) {
        return -1;
      }
      index++;
      j++;
    }
    return this.callPathSize - index;
  }
}