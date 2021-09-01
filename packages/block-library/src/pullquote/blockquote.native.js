/**
 * External dependencies
 */
import { View } from 'react-native';
/**
 * WordPress dependencies
 */
import { Children, cloneElement } from '@wordpress/element';
/**
 * Internal dependencies
 */
import styles from './blockquote.scss';

export const BlockQuote = ( props ) => {
	const citationStyle = { ...styles.citation };
	const quoteStyle = { ...styles.quote };

	if ( props.textColor ) {
		citationStyle.color = props.textColor;
		quoteStyle.color = props.textColor;
	}

	const newChildren = Children.map( props.children, ( child ) => {
		if ( child && child.props.identifier === 'value' ) {
			return cloneElement( child, {
				style: citationStyle,
			} );
		}
		if ( child && child.props.identifier === 'citation' ) {
			return cloneElement( child, {
				style: quoteStyle,
			} );
		}
		return child;
	} );
	return <View>{ newChildren }</View>;
};
