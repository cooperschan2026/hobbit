"""从新浪（经 AKShare）下载国内商品期货的单合约日线，存成 data/contracts.parquet。

新浪只保留大约最近 7~8 年到期的合约，更早的会逐渐查不到，所以下载过的数据要留存。
重复运行时只补拉缺失或尚未到期的合约。
"""
import argparse
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import akshare as ak
import pyarrow  # noqa: F401  提前确认能写 parquet，免得下载完才报错
import pandas as pd

DATA = Path(__file__).parent / "data"
OUT = DATA / "contracts.parquet"

# 品种代码 -> (中文名, 交易所)
UNIVERSE = {
    # 上期所 / 上期能源
    "CU": ("铜", "SHFE"), "AL": ("铝", "SHFE"), "ZN": ("锌", "SHFE"), "PB": ("铅", "SHFE"),
    "NI": ("镍", "SHFE"), "SN": ("锡", "SHFE"), "AU": ("黄金", "SHFE"), "AG": ("白银", "SHFE"),
    "RB": ("螺纹钢", "SHFE"), "HC": ("热卷", "SHFE"), "SS": ("不锈钢", "SHFE"), "BU": ("沥青", "SHFE"),
    "RU": ("橡胶", "SHFE"), "FU": ("燃料油", "SHFE"), "SP": ("纸浆", "SHFE"), "AO": ("氧化铝", "SHFE"),
    "BR": ("丁二烯橡胶", "SHFE"), "SC": ("原油", "INE"), "LU": ("低硫燃料油", "INE"),
    "NR": ("20号胶", "INE"), "BC": ("国际铜", "INE"), "EC": ("集运欧线", "INE"),
    # 大商所
    "A": ("豆一", "DCE"), "B": ("豆二", "DCE"), "M": ("豆粕", "DCE"), "Y": ("豆油", "DCE"),
    "P": ("棕榈油", "DCE"), "C": ("玉米", "DCE"), "CS": ("淀粉", "DCE"), "JD": ("鸡蛋", "DCE"),
    "L": ("塑料", "DCE"), "V": ("PVC", "DCE"), "PP": ("聚丙烯", "DCE"), "J": ("焦炭", "DCE"),
    "JM": ("焦煤", "DCE"), "I": ("铁矿石", "DCE"), "EG": ("乙二醇", "DCE"), "EB": ("苯乙烯", "DCE"),
    "PG": ("液化气", "DCE"), "LH": ("生猪", "DCE"),
    # 郑商所
    "SR": ("白糖", "CZCE"), "CF": ("棉花", "CZCE"), "TA": ("PTA", "CZCE"), "MA": ("甲醇", "CZCE"),
    "RM": ("菜粕", "CZCE"), "OI": ("菜油", "CZCE"), "FG": ("玻璃", "CZCE"), "SA": ("纯碱", "CZCE"),
    "AP": ("苹果", "CZCE"), "CJ": ("红枣", "CZCE"), "UR": ("尿素", "CZCE"), "SF": ("硅铁", "CZCE"),
    "SM": ("锰硅", "CZCE"), "PF": ("短纤", "CZCE"), "PK": ("花生", "CZCE"), "SH": ("烧碱", "CZCE"),
    "PX": ("对二甲苯", "CZCE"),
    # 广期所
    "SI": ("工业硅", "GFEX"), "LC": ("碳酸锂", "GFEX"), "PS": ("多晶硅", "GFEX"),
}


def fetch_one(contract: str) -> pd.DataFrame | None:
    for attempt in range(3):
        try:
            df = ak.futures_zh_daily_sina(symbol=contract)
            break
        except ValueError:  # 合约不存在或新浪已不保留
            return None
        except Exception:
            time.sleep(2 ** attempt)
    else:
        return None
    if df is None or df.empty:
        return None
    df = df.rename(columns={"hold": "oi"})
    df["date"] = pd.to_datetime(df["date"])
    df["contract"] = contract
    return df[["date", "contract", "open", "high", "low", "close", "settle", "volume", "oi"]]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--first-year", type=int, default=2019)
    ap.add_argument("--last-year", type=int, default=pd.Timestamp.today().year + 1)
    ap.add_argument("--threads", type=int, default=8)
    args = ap.parse_args()

    old = pd.read_parquet(OUT) if OUT.exists() else None
    today = pd.Timestamp.today().normalize()
    # 已过期且已下载过的合约不必再拉
    done = set()
    if old is not None:
        last = old.groupby("contract")["date"].max()
        done = set(last[last < today - pd.Timedelta(days=10)].index)

    contracts = [f"{s}{y % 100:02d}{m:02d}" for s in UNIVERSE
                 for y in range(args.first_year, args.last_year + 1) for m in range(1, 13)]
    todo = [c for c in contracts if c not in done]
    print(f"{len(todo)} contracts to fetch ({len(done)} cached)", flush=True)

    frames, t0 = [], time.time()
    with ThreadPoolExecutor(args.threads) as ex:
        for i, df in enumerate(ex.map(fetch_one, todo), 1):
            if df is not None:
                frames.append(df)
            if i % 200 == 0:
                print(f"  {i}/{len(todo)}  hits={len(frames)}  {time.time() - t0:.0f}s", flush=True)

    new = pd.concat(frames, ignore_index=True)
    if old is not None:
        new = pd.concat([old[~old.contract.isin(new.contract.unique())], new], ignore_index=True)
    new["symbol"] = new["contract"].str.extract(r"^([A-Z]+)")[0]
    new = new.sort_values(["symbol", "contract", "date"]).reset_index(drop=True)
    DATA.mkdir(exist_ok=True)
    new.to_parquet(OUT, index=False)
    print(f"saved {len(new):,} rows, {new.contract.nunique()} contracts, "
          f"{new.symbol.nunique()} symbols -> {OUT}")


if __name__ == "__main__":
    main()
