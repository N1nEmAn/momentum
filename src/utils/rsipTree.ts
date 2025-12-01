import { RSIPNode, RSIPTreeNode } from '../types';

/**
 * 将扁平的 RSIP 节点数组转换为树状结构
 */
export const buildRSIPTree = (nodes: RSIPNode[]): RSIPTreeNode[] => {
  const nodeMap = new Map<string, RSIPTreeNode>();

  // 初始化节点
  nodes.forEach(n => {
    nodeMap.set(n.id, { ...n, children: [], depth: 0 });
  });

  const roots: RSIPTreeNode[] = [];

  nodes.forEach(n => {
    const node = nodeMap.get(n.id)!;
    if (n.parentId) {
      const parent = nodeMap.get(n.parentId);
      if (parent) {
        parent.children.push(node);
        node.depth = parent.depth + 1;
      } else {
        // 父节点不存在则作为根
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  });

  const sortChildren = (node: RSIPTreeNode) => {
    node.children.sort((a, b) => a.sortOrder - b.sortOrder);
    node.children.forEach(sortChildren);
  };
  roots.forEach(sortChildren);
  roots.sort((a, b) => a.sortOrder - b.sortOrder);

  return roots;
};

/**
 * 计算某节点的子孙数量（用于失败删除时的提示）
 */
export const countDescendants = (node: RSIPTreeNode): number => {
  let count = node.children.length;
  node.children.forEach(c => { count += countDescendants(c); });
  return count;
};

/**
 * 删除节点及其所有子节点，返回新数组
 */
export const deleteNodeAndDescendants = (nodes: RSIPNode[], nodeId: string): RSIPNode[] => {
  const idsToDelete = new Set<string>();

  const index = new Map<string, RSIPNode[]>();
  nodes.forEach(n => {
    const list = index.get(n.parentId || '') || [];
    list.push(n);
    index.set(n.parentId || '', list);
  });

  const collect = (id: string) => {
    idsToDelete.add(id);
    const children = index.get(id) || [];
    children.forEach(ch => collect(ch.id));
  };
  collect(nodeId);

  return nodes.filter(n => !idsToDelete.has(n.id));
};


