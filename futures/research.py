"""商品期货因子研究：主力连续收益 -> 因子 -> IC / 分组 / 多空回测 -> results/*.csv。

约定：所有信号用第 t 日收盘及以前的数据计算，在 t+1 日收盘按信号调仓（留一天执行时间），
赚 t+2 日起的收益。同一个收盘价既算信号又成交，会被收盘价噪声（买卖价差、尾盘冲量）带偏。
"""
from pathlib import Path

import numpy as np
import pandas as pd

from fetch_sina import UNIVERSE

HERE = Path(__file__).parent
DATA = HERE / "data"
OUT = HERE / "results"

START = "2019-07-01"   # 新浪单合约数据从 2018 年中开始，主力合约链到 2019 年年中才完整
SPLIT = "2023-01-01"   # 样本内 / 样本外分界
COST = 0.0003          # 单边成本（手续费 + 滑点），按换手的名义金额计
MAX_ABS_RET = 0.25     # 单日涨跌幅超过 25% 视为数据错误
MIN_VOLUME = 5000      # 主力合约 20 日均成交量（手）门槛
MIN_HISTORY = 120      # 品种至少有 120 个交易日的主力收益才进入股票池
MIN_N = 10             # 截面上至少 10 个品种才做多空
LAG = 1                # 信号到成交的延迟（交易日）
VOL_WIN = 60           # 波动率窗口，用于风险平价加权


# ---------------------------------------------------------------- 数据
def load_contracts():
    df = pd.read_parquet(DATA / "contracts.parquet")
    df = df.dropna(subset=["close"]).query("close > 0")
    df = df.drop_duplicates(["contract", "date"], keep="last")
    yymm = df["contract"].str[-4:].astype(int)
    df["expiry"] = (2000 + yymm // 100) * 12 + yymm % 100  # 交割月序号，越大越远
    return df


def build_symbol(g):
    """单个品种：逐日选主力（持仓量最大、只向远月换、不回滚），
    算主力合约上的日收益，以及主力 vs 次主力的年化展期收益（carry）。"""
    exp = g.groupby("contract")["expiry"].first().sort_values()
    cols = exp.index
    close = g.pivot(index="date", columns="contract", values="close")[cols]
    C = close.values
    O = g.pivot(index="date", columns="contract", values="oi").reindex(columns=cols).fillna(0).values
    V = g.pivot(index="date", columns="contract", values="volume").reindex(columns=cols).fillna(0).values
    E = exp.values
    n = len(close)
    main = np.full(n, -1)
    carry = np.full(n, np.nan)
    ret = np.full(n, np.nan)
    cur = -1
    for t in range(n):
        valid = ~np.isnan(C[t]) & (O[t] > 0)
        if t > 0 and cur >= 0 and not np.isnan(C[t, cur]) and not np.isnan(C[t - 1, cur]):
            ret[t] = C[t, cur] / C[t - 1, cur] - 1   # 昨天定的主力，今天的收益
        if not valid.any():
            main[t] = cur
            continue
        oi = np.where(valid, O[t], -1)
        if cur < 0 or not valid[cur]:
            later = oi.copy()
            later[: max(cur, 0)] = -1                # 只往远月找
            cur = int(np.argmax(later)) if later.max() > 0 else int(np.argmax(oi))
        else:
            cand = int(np.argmax(oi))
            if cand > cur and oi[cand] > oi[cur]:
                cur = cand
        main[t] = cur
        far = oi.copy()
        far[: cur + 1] = -1
        if far.max() > 0:
            j = int(np.argmax(far))
            carry[t] = (np.log(C[t, cur]) - np.log(C[t, j])) * 12 / (E[j] - E[cur])
    names = np.array(cols)
    idx = np.arange(n)
    ok = main >= 0
    out = pd.DataFrame({
        "main": np.where(ok, names[np.maximum(main, 0)], None),
        "ret": ret,
        "carry": carry,
        "volume": np.where(ok, V[idx, np.maximum(main, 0)], np.nan),
        "close": np.where(ok, C[idx, np.maximum(main, 0)], np.nan),
    }, index=close.index)
    return out


def build_panel(df):
    frames = {s: build_symbol(g) for s, g in df.groupby("symbol")}
    panel = pd.concat(frames, names=["symbol", "date"]).reset_index()
    bad = panel["ret"].abs() > MAX_ABS_RET
    panel.loc[bad, "ret"] = np.nan
    panel.to_parquet(DATA / "main_continuous.parquet", index=False)
    wide = {k: panel.pivot(index="date", columns="symbol", values=k)
            for k in ["ret", "carry", "volume", "close"]}
    wide["main"] = panel.pivot(index="date", columns="symbol", values="main")
    return wide, int(bad.sum())


# ---------------------------------------------------------------- 回测
def momentum(ret, look):
    return np.log1p(ret).rolling(look, min_periods=int(look * 0.8)).sum()


def eligibility(w):
    ret = w["ret"]
    hist = ret.notna().cumsum()
    vol = ret.rolling(VOL_WIN, min_periods=40).std()
    liquid = w["volume"].rolling(20, min_periods=15).mean() >= MIN_VOLUME
    return liquid & (hist >= MIN_HISTORY) & vol.notna(), vol


def weights(sig, elig, vol, hold, mode, q=0.2, group=None, n_groups=5):
    """按调仓频率生成每日目标权重（t 日收盘时的持仓）。
    mode: cs = 截面多空（多前 q、空后 q，组内风险平价，多空各 0.5）
          ts = 时序（按信号正负做多/做空，风险平价，总杠杆 1）
          group = 第 group 组等权做多（分组检验用）"""
    S, E, Vl = sig.values, elig.values, vol.values
    E = E & ~np.isnan(S)
    n, m = S.shape
    W = np.zeros((n, m))
    w = np.zeros(m)
    for i in range(n):
        if i % hold == 0:
            idx = np.where(E[i])[0]
            w = np.zeros(m)
            if len(idx) >= MIN_N:
                iv = 1 / Vl[i, idx]
                if mode == "cs":
                    o = np.argsort(S[i, idx], kind="stable")
                    k = max(1, int(len(idx) * q + 0.5))
                    lo, hi = o[:k], o[-k:]
                    w[idx[hi]] = 0.5 * iv[hi] / iv[hi].sum()
                    w[idx[lo]] = -0.5 * iv[lo] / iv[lo].sum()
                elif mode == "ts":
                    x = np.sign(S[i, idx]) * iv
                    if np.abs(x).sum() > 0:
                        w[idx] = x / np.abs(x).sum()
                elif mode == "group":
                    o = np.argsort(S[i, idx], kind="stable")
                    part = np.array_split(o, n_groups)[group]
                    w[idx[part]] = 1 / len(part)
        W[i] = w
    return W


def run(W, ret, cost=COST, lag=LAG):
    if lag:
        W = np.vstack([np.zeros((lag, W.shape[1])), W[:-lag]])  # t 日的信号在 t+lag 日收盘才成交
    R = np.nan_to_num(ret.values)
    gross = np.r_[0.0, (W[:-1] * R[1:]).sum(1)]
    turnover = np.abs(np.diff(W, axis=0, prepend=np.zeros((1, W.shape[1])))).sum(1)
    net = gross - turnover * cost
    return pd.DataFrame({"gross": gross, "net": net, "turnover": turnover}, index=ret.index)


def stats(r, turnover=None):
    r = r.dropna()
    ann = r.mean() * 252
    vol = r.std() * np.sqrt(252)
    nav = (1 + r).cumprod()
    mdd = (nav / nav.cummax() - 1).min()
    out = {"ann_ret": ann, "ann_vol": vol, "sharpe": ann / vol if vol > 0 else np.nan,
           "max_dd": mdd, "calmar": ann / abs(mdd) if mdd < 0 else np.nan,
           "win_rate_month": float(((1 + r).resample("ME").prod() > 1).mean())}
    if turnover is not None:
        out["turnover_ann"] = turnover.loc[r.index].mean() * 252
    return {k: float(v) for k, v in out.items()}


def rank_ic(sig, ret, elig, horizon=5):
    fwd = np.log1p(ret.fillna(0)).rolling(horizon).sum().shift(-horizon - LAG)  # 与回测一致：跳过执行日
    s = sig.where(elig)
    f = fwd.where(s.notna())
    ok = s.notna().sum(1) >= MIN_N
    ic = s[ok].rank(axis=1).corrwith(f[ok].rank(axis=1), axis=1, method="pearson")
    ic = ic.dropna()
    sparse = ic.iloc[::horizon]  # 不重叠样本算 t 值
    return ic, {"mean": float(ic.mean()), "pos_ratio": float((ic > 0).mean()),
                "t_stat": float(sparse.mean() / sparse.std() * np.sqrt(len(sparse))),
                "ir": float(sparse.mean() / sparse.std())}


def zscore(df, elig):
    x = df.where(elig)
    return x.sub(x.mean(1), axis=0).div(x.std(1), axis=0)


# ---------------------------------------------------------------- 主流程
def main():
    df = load_contracts()
    w, n_bad = build_panel(df)
    elig_all, vol_all = eligibility(w)
    sl = slice(START, None)
    ret, elig, vol = w["ret"].loc[sl], elig_all.loc[sl], vol_all.loc[sl]

    carry = w["carry"]
    mom60 = momentum(w["ret"], 60)
    signals = {
        "carry": ("期限结构 Carry", carry.loc[sl], "cs", 5),
        "xsmom": ("截面动量 60日", mom60.loc[sl], "cs", 5),
        "tsmom": ("时序动量 60日", mom60.loc[sl], "ts", 5),
    }
    combo = (zscore(carry, elig_all) + zscore(mom60, elig_all)) / 2
    signals["combo"] = ("组合 Carry+动量", combo.loc[sl], "cs", 5)

    OUT.mkdir(exist_ok=True)
    tables = {}

    # 1. 四个策略：净值、汇总指标、逐年收益、当前持仓
    summary, navs, yearly, daily, last_w = [], [], [], {}, {}
    for key, (name, sig, mode, hold) in signals.items():
        W = weights(sig, elig, vol, hold, mode)
        bt = run(W, ret)
        daily[key] = bt["net"]
        last_w[key] = W[-1]
        full, gross = stats(bt["net"], bt["turnover"]), stats(bt["gross"])
        is_, oos = stats(bt["net"].loc[:SPLIT]), stats(bt["net"].loc[SPLIT:])
        summary.append({"key": key, "name": name, **full, "sharpe_gross": gross["sharpe"],
                        "sharpe_is": is_["sharpe"], "sharpe_oos": oos["sharpe"],
                        "ann_ret_is": is_["ann_ret"], "ann_ret_oos": oos["ann_ret"]})
        nav = (1 + bt["net"]).cumprod()
        pick = nav.iloc[::5]
        if pick.index[-1] != nav.index[-1]:
            pick = pd.concat([pick, nav.iloc[-1:]])
        navs += [{"date": d.strftime("%Y-%m-%d"), "key": key, "nav": v} for d, v in pick.items()]
        for y, v in ((1 + bt["net"]).groupby(bt.index.year).prod() - 1).items():
            yearly.append({"key": key, "year": int(y), "ret": v})
    tables["summary"] = pd.DataFrame(summary)
    tables["nav"] = pd.DataFrame(navs)
    tables["yearly"] = pd.DataFrame(yearly)
    corr = pd.DataFrame(daily).corr()
    tables["corr"] = corr.rename_axis("a").reset_index().melt(id_vars="a", var_name="b", value_name="corr")

    # 2. IC 与五分组（不扣费）
    ic_m, ic_s, groups = [], [], []
    for key in ["carry", "xsmom"]:
        name, sig, _, _ = signals[key]
        ic, summ = rank_ic(sig, ret, elig)
        ic_s.append({"factor": key, "name": name, **summ})
        ic_m += [{"factor": key, "month": d.strftime("%Y-%m"), "ic": v} for d, v in ic.resample("ME").mean().items()]
        for g in range(5):
            s = stats(run(weights(sig, elig, vol, 5, "group", group=g), ret, cost=0)["gross"])
            groups.append({"factor": key, "group": g + 1, "ann_ret": s["ann_ret"], "sharpe": s["sharpe"]})
    ones = pd.DataFrame(1.0, index=ret.index, columns=ret.columns)
    s = stats(run(weights(ones, elig, vol, 5, "group", group=0, n_groups=1), ret, cost=0)["gross"])
    groups.append({"factor": "equal_weight", "group": 0, "ann_ret": s["ann_ret"], "sharpe": s["sharpe"]})
    tables["ic_monthly"], tables["ic_summary"], tables["groups"] = pd.DataFrame(ic_m), pd.DataFrame(ic_s), pd.DataFrame(groups)

    # 3. 参数敏感性（扣费夏普，全样本 + 样本内/外）
    holds = [1, 5, 10, 20]
    grid = []
    for L in [5, 10, 20, 40, 60, 120, 250]:
        sig = momentum(w["ret"], L).loc[sl]
        for h in holds:
            r = run(weights(sig, elig, vol, h, "cs"), ret)["net"]
            grid.append({"factor": "xsmom", "param": L, "hold": h, "sharpe": stats(r)["sharpe"],
                         "sharpe_is": stats(r.loc[:SPLIT])["sharpe"], "sharpe_oos": stats(r.loc[SPLIT:])["sharpe"]})
    for L in [1, 5, 10, 20, 40, 60, 120]:
        sig = carry.rolling(L, min_periods=1).mean().loc[sl]
        for h in holds:
            r = run(weights(sig, elig, vol, h, "cs"), ret)["net"]
            grid.append({"factor": "carry", "param": L, "hold": h, "sharpe": stats(r)["sharpe"],
                         "sharpe_is": stats(r.loc[:SPLIT])["sharpe"], "sharpe_oos": stats(r.loc[SPLIT:])["sharpe"]})
    tables["grid"] = pd.DataFrame(grid)

    # 4. 最新信号与持仓（最近一个交易日收盘）
    last = ret.index[-1]
    latest = []
    for j, s in enumerate(ret.columns):
        if not elig.loc[last, s]:
            continue
        row = {"symbol": s, "name": UNIVERSE.get(s, (s,))[0], "main": w["main"].loc[last, s],
               "close": w["close"].loc[last, s], "carry": carry.loc[last, s],
               "mom60": mom60.loc[last, s], "combo": combo.loc[last, s]}
        for key in signals:
            x = last_w[key][j]
            row["pos_" + key] = "多" if x > 1e-12 else ("空" if x < -1e-12 else "")
        latest.append(row)
    tables["latest"] = pd.DataFrame(latest)

    # 5. 股票池与数据说明
    n_elig = elig.sum(1)
    tables["universe"] = pd.DataFrame({"month": n_elig.resample("ME").last().index.strftime("%Y-%m"),
                                       "n": n_elig.resample("ME").last().values})
    tables["meta"] = pd.DataFrame([{
        "start": ret.index[0].strftime("%Y-%m-%d"), "end": last.strftime("%Y-%m-%d"), "split": SPLIT,
        "cost_bps": COST * 1e4, "n_contracts": df.contract.nunique(), "n_rows": len(df),
        "n_symbols": int((elig.sum() > 0).sum()), "n_bad_returns": n_bad,
        "universe_min": int(n_elig.min()), "universe_median": int(n_elig.median()), "universe_max": int(n_elig.max()),
    }])

    for k, t in tables.items():
        t.to_csv(OUT / f"{k}.csv", index=False, float_format="%.6g")
    print(tables["summary"][["name", "ann_ret", "ann_vol", "sharpe", "max_dd", "turnover_ann",
                             "sharpe_gross", "sharpe_is", "sharpe_oos"]].round(3).to_string(index=False))
    print(tables["ic_summary"].round(3).to_string(index=False))
    print(tables["groups"].round(3).to_string(index=False))
    print(tables["meta"].T.to_string())


if __name__ == "__main__":
    main()
