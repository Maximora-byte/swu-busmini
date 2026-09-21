import type { BusStop } from '../models/index'

/** 微信运行时使用的站点数据 Adapter。 */
export const stops: readonly BusStop[] = [
  { id: 'jingguanyuan', name: '经管院', aliases: ['经济管理学院'], coordinate: null, coordinateTodo: 'TODO: waiting for field verification' },
  { id: 'gate_6', name: '六号门', aliases: ['6号门'], coordinate: null, coordinateTodo: 'TODO: waiting for field verification' },
  { id: 'gate_2', name: '二号门', aliases: ['2号门'], coordinate: null, coordinateTodo: 'TODO: waiting for field verification' },
  { id: 'building_8', name: '八教', aliases: ['第八教学楼', '8教'], coordinate: null, coordinateTodo: 'TODO: waiting for field verification' },
  { id: 'tianjiabing', name: '田家炳', aliases: ['田家炳教育书院'], coordinate: null, coordinateTodo: 'TODO: waiting for field verification' },
  { id: 'yuanding', name: '圆顶', aliases: [], coordinate: null, coordinateTodo: 'TODO: waiting for field verification' },
  { id: 'gate_5', name: '五号门', aliases: ['5号门'], coordinate: null, coordinateTodo: 'TODO: waiting for field verification' },
  { id: 'xishijie', name: '西师街', aliases: [], coordinate: null, coordinateTodo: 'TODO: waiting for field verification' },
  { id: 'zhuyuan', name: '竹园', aliases: [], coordinate: null, coordinateTodo: 'TODO: waiting for field verification' },
  { id: 'building_5', name: '五教', aliases: ['第五教学楼', '5教'], coordinate: null, coordinateTodo: 'TODO: waiting for field verification' },
  { id: 'meiyuan', name: '梅园', aliases: [], coordinate: null, coordinateTodo: 'TODO: waiting for field verification' },
  { id: 'juyuan', name: '橘园', aliases: [], coordinate: null, coordinateTodo: 'TODO: waiting for field verification' },
  { id: 'canteen_2', name: '二食堂', aliases: ['第二食堂', '2食堂'], coordinate: null, coordinateTodo: 'TODO: waiting for field verification' },
  { id: 'geosciences', name: '地科院', aliases: [], coordinate: null, coordinateTodo: 'TODO: waiting for field verification' },
  { id: 'foreign_languages', name: '外语学院', aliases: ['外国语学院'], coordinate: null, coordinateTodo: 'TODO: waiting for field verification' },
  { id: 'building_26', name: '二十六教', aliases: ['26教', '第二十六教学楼'], coordinate: null, coordinateTodo: 'TODO: waiting for field verification' },
  { id: 'liyuan', name: '李园', aliases: [], coordinate: null, coordinateTodo: 'TODO: waiting for field verification' },
  { id: 'auditorium', name: '大礼堂', aliases: [], coordinate: null, coordinateTodo: 'TODO: waiting for field verification' },
  { id: 'music_school', name: '音乐学院', aliases: [], coordinate: null, coordinateTodo: 'TODO: waiting for field verification' },
  { id: 'zhongtu', name: '中图', aliases: [], coordinate: null, coordinateTodo: 'TODO: waiting for field verification', dataTodo: 'TODO: confirm the full station name and whether it is the same place as library' },
  { id: 'gate_1', name: '一号门', aliases: ['1号门'], coordinate: null, coordinateTodo: 'TODO: waiting for field verification', dataTodo: 'TODO: retained from the previous dataset; not referenced by the 2025 numbered routes' },
  { id: 'library', name: '图书馆', aliases: [], coordinate: null, coordinateTodo: 'TODO: waiting for field verification', dataTodo: 'TODO: retained from the previous dataset; confirm relation to the 2025 map label 中图' },
]
