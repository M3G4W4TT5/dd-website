import {Fragment} from 'react';
import {PortableText, type PortableTextComponents} from '@portabletext/react';
import type {RichTextValue} from '../cms/model';
const marks: PortableTextComponents['marks'] = {
  link: ({children, value}) => <a href={value?.href} {...(value?.external ? {target: '_blank', rel: 'noopener noreferrer'} : {})}>{children}</a>,
};
export function RichText({value, inline = false, italicTag = 'em'}: {value: RichTextValue; inline?: boolean; italicTag?: 'em' | 'i'}) {
  return <PortableText value={value} components={{marks: {...marks, em: ({children}) => italicTag === 'i' ? <i>{children}</i> : <em>{children}</em>}, ...(inline ? {block: {normal: ({children}) => <Fragment>{children}</Fragment>}} : {})}} />;
}
