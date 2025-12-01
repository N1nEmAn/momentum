import React, { useEffect, useMemo, useState, useRef } from 'react';
import { RSIPNode, RSIPTreeNode, RSIPMeta } from '../types';
import { buildRSIPTree, countDescendants, deleteNodeAndDescendants } from '../utils/rsipTree';
import { Plus, Trash2, ArrowLeft, Clock, Play } from 'lucide-react';

interface RSIPViewProps {
  nodes: RSIPNode[];
  meta: RSIPMeta;
  onBack: () => void;
  onSaveNodes: (nodes: RSIPNode[]) => void;
  onSaveMeta: (meta: RSIPMeta) => void;
}

export const RSIPView: React.FC<RSIPViewProps> = ({ nodes, meta, onBack, onSaveNodes, onSaveMeta }) => {
  const tree = useMemo<RSIPTreeNode[]>(() => buildRSIPTree(nodes), [nodes]);
  const [selectedParentId, setSelectedParentId] = useState<string | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [rule, setRule] = useState('');

  const canAddToday = (() => {
    if (meta.allowMultiplePerDay) return true;
    if (!meta.lastAddedAt) return true;
    const last = new Date(meta.lastAddedAt);
    const now = new Date();
    return last.toDateString() !== now.toDateString();
  })();

  const handleAdd = () => {
    if (!canAddToday) return;
    if (!title.trim() || !rule.trim()) return;
    const newNode: RSIPNode = {
      id: crypto.randomUUID(),
      parentId: selectedParentId || undefined,
      title: title.trim(),
      rule: rule.trim(),
      sortOrder: Math.floor(Date.now() / 1000),
      createdAt: new Date(),
      useTimer: createUseTimer,
      timerMinutes: createUseTimer ? createTimerMinutes : undefined,
      type: createType,
      emoji: createEmoji,
    };
    const newNodes = [...nodes, newNode];
    onSaveNodes(newNodes);
    onSaveMeta({ ...meta, lastAddedAt: new Date() });
    setTitle('');
    setRule('');
  };

  const handleFailure = (nodeId: string) => {
    const treeNodes = buildRSIPTree(nodes);
    const find = (arr: RSIPTreeNode[], id: string): RSIPTreeNode | null => {
      for (const n of arr) {
        if (n.id === id) return n;
        const got = find(n.children, id);
        if (got) return got;
      }
      return null;
    };
    const node = find(treeNodes, nodeId);
    if (!node) return;
    const descendants = countDescendants(node);
    if (!confirm(`判定失败：将删除「${node.title}」及其 ${descendants} 个子节点。确认回溯？`)) return;
    const newNodes = deleteNodeAndDescendants(nodes, nodeId);
    onSaveNodes(newNodes);
  };

  // Timer Logic
  const [now, setNow] = useState<number>(Date.now());
  const [activeTimers, setActiveTimers] = useState<Record<string, number>>({}); // nodeId -> endsAt ms

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    // check timers
    Object.entries(activeTimers).forEach(([id, endsAt]) => {
      if (now >= endsAt) {
        // notify once and clear
        setActiveTimers(prev => {
          const copy = { ...prev } as Record<string, number>;
          delete copy[id];
          return copy;
        });
        try {
          if ('Notification' in window) {
            if (Notification.permission === 'granted') {
              new Notification('计时完成', { body: 'RSIP 定式计时已结束' });
            } else if (Notification.permission !== 'denied') {
              Notification.requestPermission();
            }
          }
         } catch {
           // ignore
         }
      }
    });
  }, [now, activeTimers]);

  const formatRemaining = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const mm = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const handleStartTimer = (nodeId: string, minutes: number) => {
    const endsAt = Date.now() + minutes * 60 * 1000;
    setActiveTimers(prev => ({ ...prev, [nodeId]: endsAt }));
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  };

  const handleStopTimer = (nodeId: string) => {
    if (confirm('确定要停止计时吗？')) {
      setActiveTimers(prev => {
        const copy = { ...prev };
        delete copy[nodeId];
        return copy;
      });
    }
  };

  // 新增：用于 Civ6 风格横向卡片渲染（不递归渲染子节点）
  const renderPolicyCard = (node: RSIPTreeNode, style: React.CSSProperties = {}) => {
    const ntype = node.type || 'policy';
    const color = typeColorMap[ntype] || typeColorMap.policy;
    const isDraggingThis = draggingId === node.id;
    
    const endsAt = activeTimers[node.id];
    const isRunning = endsAt && endsAt > now;
    const remaining = isRunning ? endsAt - now : 0;

    return (
      <div
        ref={el => nodeRefs.current[node.id] = el}
        key={node.id}
        style={style}
        draggable
        onDragStart={(e) => onDragStartNode(e, node.id)}
        onDragEnd={onDragEndNode}
        onDrop={(e) => onDropOnNode(e, node.id)}
        onDragOver={(e) => e.preventDefault()}
        onMouseEnter={() => setHoveredId(node.id)}
        onMouseLeave={() => setHoveredId(null)}
        className={`absolute w-64 rounded-2xl p-4 backdrop-blur-sm shadow-lg transition-all duration-300 transform-gpu ${color.bg} ${color.border} ${hoveredChainIds.has(node.id) ? `ring-2 ${color.ring} scale-105 shadow-2xl` : ''} ${isDraggingThis ? 'opacity-30 scale-90' : 'opacity-100'}`}
      >
        <div className="flex items-start space-x-3">
          <div className="text-3xl leading-none pt-1" aria-hidden>
            {node.emoji || '📝'}
          </div>
          <div className="flex-1">
            <h4 className="text-md font-bold font-chinese text-gray-900 dark:text-slate-100">{node.title}</h4>
            <p className="text-xs text-gray-600 dark:text-slate-400 font-chinese whitespace-pre-wrap mt-1">{node.rule}</p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center space-x-2">
            {node.useTimer && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (isRunning) {
                    handleStopTimer(node.id);
                  } else {
                    handleStartTimer(node.id, node.timerMinutes || 15);
                  }
                }}
                className={`inline-flex items-center text-xs px-2 py-1 rounded-xl transition-colors ${isRunning ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 animate-pulse' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'}`}
              >
                {isRunning ? (
                  <>
                    <Clock size={12} className="mr-1" /> {formatRemaining(remaining)}
                  </>
                ) : (
                  <>
                    <Play size={12} className="mr-1" /> {node.timerMinutes} 分钟
                  </>
                )}
              </button>
            )}
          </div>
          <button
            onClick={() => handleFailure(node.id)}
            className="p-1.5 text-red-500 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            title="判定失败（删除此节点及其所有子节点）"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
  }

  const flatForSelect = (arr: RSIPTreeNode[]): RSIPTreeNode[] => {
    const res: RSIPTreeNode[] = [];
    const walk = (n: RSIPTreeNode) => { res.push(n); n.children.forEach(walk); };
    arr.forEach(walk);
    return res;
  };

  // Create form state for timer and daily policy
  const [createUseTimer, setCreateUseTimer] = useState<boolean>(false);
  const [createTimerMinutes, setCreateTimerMinutes] = useState<number>(15);
  const [createType, setCreateType] = useState<string>('policy');
  const [createEmoji, setCreateEmoji] = useState<string>('📝');

  // 预设类型 -> emoji 映射
  const typeEmojiMap: Record<string, string> = { policy: '📝', habit: '🔄', reward: '🌟', penalty: '❌', ritual: '🧘', goal: '🏁', trigger: '➡️', reminder: '⏰' };
  
  // 类型标签映射
  const typeLabelMap: Record<string, string> = {
    policy: '国策',
    habit: '习惯',
    reward: '奖励',
    penalty: '惩罚',
    ritual: '仪式',
    goal: '目标',
    trigger: '触发器',
    reminder: '提醒',
  };

  // 颜色映射：类型 -> 徽章/环/背景样式
  const typeColorMap: Record<string, { badge: string; ring: string; bg: string; border: string; }> = {
    policy: { badge: 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200', ring: 'ring-gray-400 dark:ring-gray-500', bg: 'bg-gray-100 dark:bg-slate-800', border: 'border-gray-300 dark:border-slate-600' },
    habit: { badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200', ring: 'ring-blue-400 dark:ring-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/40', border: 'border-blue-300 dark:border-blue-700' },
    reward: { badge: 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200', ring: 'ring-yellow-400 dark:ring-yellow-600', bg: 'bg-yellow-100 dark:bg-yellow-900/40', border: 'border-yellow-300 dark:border-yellow-700' },
    penalty: { badge: 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200', ring: 'ring-red-400 dark:ring-red-600', bg: 'bg-red-100 dark:bg-red-900/40', border: 'border-red-300 dark:border-red-700' },
    ritual: { badge: 'bg-pink-100 dark:bg-pink-900/20 text-pink-700 dark:text-pink-200', ring: 'ring-pink-400 dark:ring-pink-600', bg: 'bg-pink-100 dark:bg-pink-900/40', border: 'border-pink-300 dark:border-pink-700' },
    goal: { badge: 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200', ring: 'ring-emerald-400 dark:ring-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/40', border: 'border-emerald-300 dark:border-emerald-700' },
    trigger: { badge: 'bg-indigo-100 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-200', ring: 'ring-indigo-400 dark:ring-indigo-600', bg: 'bg-indigo-100 dark:bg-indigo-900/40', border: 'border-indigo-300 dark:border-indigo-700' },
    reminder: { badge: 'bg-violet-100 dark:bg-violet-900/20 text-violet-800 dark:text-violet-200', ring: 'ring-violet-400 dark:ring-violet-600', bg: 'bg-violet-100 dark:bg-violet-900/40', border: 'border-violet-300 dark:border-violet-700' },
  };

  const [filterType, setFilterType] = useState<string | null>(null);

  // 新增：SVG 连线与 hover 高亮的支持（支持 enter/exit 动画、链路高亮与拖拽）
  type Connector = { id: string; d: string; isHovered: boolean };
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const connectorRefs = useRef<Record<string, SVGPathElement | null>>({});
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredChainIds, setHoveredChainIds] = useState<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  
  // 布局状态
  const [nodePositions, setNodePositions] = useState<Record<string, { node: RSIPTreeNode; style: React.CSSProperties }>>({});
  const [containerHeight, setContainerHeight] = useState<number>(600);

  // 辅助：基于 nodes（扁平）快速查找父链
  const nodesById = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  // 过滤后的树
  const filteredTree = useMemo(() => {
    if (!filterType) return tree;
    const filteredNodes = new Set(nodes.filter(n => (n.type || 'policy') === filterType).map(n => n.id));
    if (filteredNodes.size === 0) return [];

    const visibleNodes = new Set<string>();
    // 从匹配的节点向上找到所有祖先
    filteredNodes.forEach(id => {
      let current = nodesById.get(id);
      while (current) {
        visibleNodes.add(current.id);
        current = current.parentId ? nodesById.get(current.parentId) : undefined;
      }
    });

    const finalNodes = nodes.filter(n => visibleNodes.has(n.id));
    return buildRSIPTree(finalNodes);
  }, [tree, filterType, nodes, nodesById]);

  // 核心布局算法：计算每个节点的绝对位置 (top, left)
  useEffect(() => {
    if (filteredTree.length === 0) {
      setNodePositions({});
      setContainerHeight(200);
      return;
    }

    const positions: Record<string, { node: RSIPTreeNode; style: React.CSSProperties }> = {};
    const LEVEL_WIDTH = 320; // 每列宽度
    const NODE_HEIGHT = 160; // 节点高度（含间距）
    const START_X = 20;
    const START_Y = 20;

    // 1. 计算每个节点的深度和子树高度（以叶子节点数为单位）
    // const measure = (node: RSIPTreeNode, depth: number): number => {
    //   if (node.children.length === 0) {
    //     return 1;
    //   }
    //   let leaves = 0;
    //   node.children.forEach(child => {
    //     leaves += measure(child, depth + 1);
    //   });
    //   return leaves;
    // };

    // 2. 递归分配位置
    let currentY = START_Y;
    
    const layout = (node: RSIPTreeNode, depth: number): number => {
      // 如果是叶子节点，分配当前Y，并推进Y
      if (node.children.length === 0) {
        const y = currentY;
        positions[node.id] = {
          node,
          style: { left: START_X + depth * LEVEL_WIDTH, top: y }
        };
        currentY += NODE_HEIGHT;
        return y;
      }

      // 如果有子节点，先布局子节点
      const childYs: number[] = [];
      node.children.forEach(child => {
        childYs.push(layout(child, depth + 1));
      });

      // 父节点Y为子节点Y的平均值（居中）
      const minY = Math.min(...childYs);
      const maxY = Math.max(...childYs);
      const y = (minY + maxY) / 2;

      positions[node.id] = {
        node,
        style: { left: START_X + depth * LEVEL_WIDTH, top: y }
      };
      return y;
    };

    // 对每个根节点（宗族）进行布局
    filteredTree.forEach(root => {
      layout(root, 0);
      // 宗族之间增加额外间距
      currentY += 40; 
    });

    setNodePositions(positions);
    setContainerHeight(Math.max(600, currentY + 100));

  }, [filteredTree]);
  
  const getAncestors = useMemo(() => (id?: string | null): string[] => {
    const res: string[] = [];
    let cur = id ? nodesById.get(id) : undefined;
    while (cur && cur.parentId) {
      res.push(cur.parentId);
      cur = nodesById.get(cur.parentId);
    }
    return res;
  }, [nodesById]);

  const getDescendantsFromTree = useMemo(() => (id: string): string[] => {
    const res: string[] = [];
    const findInTree = (arr: RSIPTreeNode[], targetId: string): RSIPTreeNode | null => {
      for (const n of arr) {
        if (n.id === targetId) return n;
        const r = findInTree(n.children, targetId);
        if (r) return r;
      }
      return null;
    };
    const node = findInTree(tree, id);
    if (!node) return res;
    const walk = (n: RSIPTreeNode) => { n.children.forEach(c => { res.push(c.id); walk(c); }); };
    walk(node);
    return res;
  }, [tree]);

  // 拖拽逻辑：开始、允许、放下
  const onDragStartNode = (e: React.DragEvent, id: string) => {
    setDraggingId(id);
    e.dataTransfer.setData('text/plain', id);
    try { e.dataTransfer.effectAllowed = 'move'; } catch { /* ignore */ }
  };

  const onDragEndNode = () => setDraggingId(null);

  const onDropOnNode = (e: React.DragEvent, targetId?: string) => {
    e.preventDefault();
    const dragId = e.dataTransfer.getData('text/plain') || draggingId;
    setDraggingId(null);
    if (!dragId) return;
    if (dragId === targetId) return;
    // prevent drop onto own descendant
    const desc = getDescendantsFromTree(dragId);
    if (targetId && desc.includes(targetId)) return; // ignore to prevent cycle
    // update nodes parentId
    const updated = nodes.map(n => n.id === dragId ? { ...n, parentId: targetId || undefined } : n);
    onSaveNodes(updated);
  };

  // hover chain计算：包括祖先与所有后代
  useEffect(() => {
    if (!hoveredId) { setHoveredChainIds(new Set()); return; }
    const ids = new Set<string>();
    ids.add(hoveredId);
    getAncestors(hoveredId).forEach(id => ids.add(id));
    getDescendantsFromTree(hoveredId).forEach(id => ids.add(id));
    setHoveredChainIds(ids);
  }, [hoveredId, getAncestors, getDescendantsFromTree]);

  // 计算连接线的路径
  useEffect(() => {
    const compute = () => {
      const container = containerRef.current;
      if (!container) return;
      // const crect = container.getBoundingClientRect(); // No longer needed for absolute positioning relative to container
      const newConnectors: Connector[] = [];

      // Helper to get anchor point from node position
      const getAnchor = (nodeId: string, side: 'left' | 'right') => {
        const pos = nodePositions[nodeId];
        if (!pos) return { x: 0, y: 0 };
        
        // Card dimensions (w-64 = 256px, p-4 implies height varies but we can estimate or measure)
        // For simplicity, we use the center of the card based on known width and estimated height
        // Or better, use the actual DOM element if available, but fallback to calculated position
        
        const el = nodeRefs.current[nodeId];
        if (el) {
           // Use actual DOM element relative to container
           const elRect = el.getBoundingClientRect();
           const containerRect = container.getBoundingClientRect();
           
           const x = side === 'left' 
             ? (elRect.left - containerRect.left) 
             : (elRect.right - containerRect.left);
           const y = (elRect.top - containerRect.top) + elRect.height / 2;
           return { x, y };
        }
        
        // Fallback to calculated style
        const styleLeft = Number(pos.style.left);
        const styleTop = Number(pos.style.top);
        const width = 256; // w-64
        const height = 120; // approx height
        
        const x = side === 'left' ? styleLeft : styleLeft + width;
        const y = styleTop + height / 2;
        return { x, y };
      };

      const walk = (node: RSIPTreeNode) => {
        node.children.forEach(child => {
          if (nodePositions[node.id] && nodePositions[child.id]) {
            const p1 = getAnchor(node.id, 'right');
            const p2 = getAnchor(child.id, 'left');
            
            const dx = p2.x - p1.x;
            const base = Math.max(40, Math.abs(dx) * 0.5);
            const cx1 = p1.x + base;
            const cy1 = p1.y;
            const cx2 = p2.x - base;
            const cy2 = p2.y;
            
            const d = `M ${p1.x} ${p1.y} C ${cx1} ${cy1} ${cx2} ${cy2} ${p2.x} ${p2.y}`;
            const id = `${node.id}_${child.id}`;
            const isHovered = hoveredChainIds.has(node.id) && hoveredChainIds.has(child.id);
            newConnectors.push({ id, d, isHovered });
          }
        });
        node.children.forEach(walk);
      };
      filteredTree.forEach(root => walk(root));
      setConnectors(newConnectors);
    };
    
    // Run compute immediately and after a short delay to allow DOM to settle
    compute();
    const t = setTimeout(compute, 50); 
    window.addEventListener('resize', compute);
    return () => { clearTimeout(t); window.removeEventListener('resize', compute); };
  }, [filteredTree, hoveredChainIds, nodePositions]);


  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto relative">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-3">
            <button onClick={onBack} className="p-3 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 rounded-2xl hover:bg-white/60 dark:hover:bg-slate-800/60">
              <ArrowLeft size={22} />
            </button>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold font-chinese text-gray-900 dark:text-slate-100">国策树 · RSIP</h1>
              <p className="text-xs font-mono text-gray-600 dark:text-slate-400 tracking-wider uppercase">Recursive Stabilization Iteration Protocol</p>
            </div>
          </div>
          {/* Daily policy toggle */}
          <div className="flex items-center space-x-3">
            <span className="text-xs font-chinese text-gray-600 dark:text-slate-400">一天可多条</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!!meta.allowMultiplePerDay}
                onChange={(e) => onSaveMeta({ ...meta, allowMultiplePerDay: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 dark:peer-focus:ring-emerald-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-500"></div>
            </label>
          </div>
        </header>

        {/* First-time empty state */}
        {nodes.length === 0 && (
          <div className="bento-card max-w-3xl mx-auto mb-8">
            <h2 className="text-2xl font-bold font-chinese text-gray-900 dark:text-slate-100 mb-3">开始你的第一条国策</h2>
            <p className="text-gray-700 dark:text-slate-300 leading-relaxed font-chinese">
              RSIP 强调通过「每天至多新增一个、失败即回溯」来稳定迭代你的生活定式。选择一个小而稳的起点，建立第一条国策吧。
            </p>
          </div>
        )}

        {/* Add form */}
        <div className="bento-card mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2 font-chinese">父节点（可空，表示新分支）</label>
              <select
                value={selectedParentId || ''}
                onChange={e => setSelectedParentId(e.target.value || undefined)}
                className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-2xl px-4 py-3 text-gray-900 dark:text-slate-100 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all duration-300 font-chinese"
              >
                <option value="">（无父节点，建立新根）</option>
                {flatForSelect(tree).map(n => (
                  <option key={n.id} value={n.id}>{'— '.repeat(n.depth)}{n.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2 font-chinese">国策标题</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="例如：进门15分钟内开始洗澡"
                className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-2xl px-4 py-3 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all duration-300 font-chinese"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2 font-chinese">精准规则</label>
              <input
                value={rule}
                onChange={e => setRule(e.target.value)}
                placeholder="例如：回家即启动15分钟计时，计时内进浴室"
                className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-2xl px-4 py-3 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all duration-300 font-chinese"
              />
            </div>
          </div>
          {/* Timer settings */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center justify-between bento-subtle px-4 py-3 rounded-2xl">
              <div className="flex items-center space-x-2">
                <Clock size={16} className="text-emerald-600" />
                <span className="text-sm font-chinese text-gray-700 dark:text-slate-300">启用计时</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={createUseTimer}
                  onChange={(e) => setCreateUseTimer(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 dark:peer-focus:ring-emerald-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-500"></div>
              </label>
            </div>
            <div className={`${createUseTimer ? '' : 'opacity-60'}`}>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2 font-chinese">计时分钟数</label>
              <input
                type="number"
                min={1}
                max={180}
                disabled={!createUseTimer}
                value={createTimerMinutes}
                onChange={(e) => setCreateTimerMinutes(Math.max(1, Math.min(180, Number(e.target.value) || 1)))}
                className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-2xl px-4 py-3 text-gray-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all duration-300 font-chinese"
              />
            </div>
          </div>
          {/* 新增：类型与 Emoji 选择 */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2 font-chinese">节点类型</label>
              <select
                value={createType}
                onChange={e => {
                  const t = e.target.value;
                  setCreateType(t);
                  setCreateEmoji(typeEmojiMap[t] || '📜');
                }}
                className="w-full bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-2xl px-3 py-2 text-gray-900 dark:text-slate-100 focus:outline-none transition-all duration-200 font-chinese"
              >
                {Object.entries(typeEmojiMap).map(([type, emoji]) => (
                  <option key={type} value={type}>{emoji} {typeLabelMap[type] || type} ({type})</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm font-chinese text-gray-600 dark:text-slate-400">
              每天最多新增一个国策。{canAddToday ? '今日可新增。' : '今日已新增，明日继续。'}
            </div>
            <button
              onClick={handleAdd}
              disabled={!canAddToday || !title.trim() || !rule.trim()}
              className={`flex items-center space-x-2 px-6 py-3 rounded-2xl font-medium transition-all duration-300 shadow-lg ${(!canAddToday || !title.trim() || !rule.trim()) ? 'bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-slate-500' : 'gradient-primary text-white hover:shadow-xl hover:scale-105'}`}
            >
              <Plus size={18} />
              <span className="font-chinese">新增国策</span>
            </button>
          </div>
        </div>

        {/* 过滤与图例栏 */}
        <div className="bento-card mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <label className="text-sm font-chinese text-gray-700 dark:text-slate-300">按类型筛选：</label>
              <select value={filterType || ''} onChange={e => setFilterType(e.target.value || null)} className="bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-2xl px-3 py-2 text-gray-900 dark:text-slate-100">
                <option value="">全部</option>
                {Object.keys(typeEmojiMap).map(t => <option key={t} value={t}>{typeLabelMap[t] || t}</option>)}
              </select>
              <button type="button" onClick={() => setFilterType(null)} className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-slate-700 text-xs">清除</button>
            </div>
            <div className="flex items-center space-x-2">
              {Object.keys(typeColorMap).map(t => {
                const col = typeColorMap[t];
                return (
                  <div key={t} className={`px-2 py-1 rounded-lg ${col.badge} text-xs font-chinese`}>{typeLabelMap[t] || t}</div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tree */}
        <div className="relative w-full" style={{ height: containerHeight }}>
          {tree.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-gray-600 dark:text-slate-400 font-chinese">尚无国策，先从上方表单添加一个吧。</div>
          ) : (
            <div ref={containerRef} className="relative w-full h-full">
              {/* SVG overlay for connectors */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <marker id="rsip-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M0,0 L8,4 L0,8 z" fill="#6b7280" />
                  </marker>
                </defs>
                {connectors.map(({ id, d, isHovered }) => (
                  <path
                    key={id}
                    ref={el => { if (el) connectorRefs.current[id] = el; }}
                    d={d}
                    fill="none"
                    stroke={isHovered ? '#f59e0b' : '#9ca3af'}
                    strokeWidth={isHovered ? 3 : 2}
                    className="transition-all duration-200"
                    markerEnd="url(#rsip-arrow)"
                  />
                ))}
              </svg>

              {/* Render nodes */}
              {Object.values(nodePositions).map(({ node, style }) => renderPolicyCard(node, style))}
            </div>
          )}
        </div>
        {/* 容器级别支持：拖放到空白处设为根 */}
        <div
          className="absolute bottom-0 left-0 w-full h-20"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const dragId = e.dataTransfer.getData('text/plain') || draggingId; if (dragId) { onDropOnNode(e, undefined); } }}
        />
      </div>
    </div>
  );
};


